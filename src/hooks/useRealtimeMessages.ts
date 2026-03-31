"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";
import type { Conversation, Message } from "@/lib/types";

// ---------------------------------------------------------------------------
// Audio notification (880 Hz sine, 300 ms fade-out)
// ---------------------------------------------------------------------------
function playNotificationSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close();
  } catch {
    // AudioContext unavailable — ignore
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useRealtimeMessages() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const activeContactIdRef = useRef<string | null>(null);
  const pendingRead = useRef<Set<string>>(new Set());
  const fetchVersion = useRef(0);

  // Keep ref in sync with state
  useEffect(() => {
    activeContactIdRef.current = activeContactId;
  }, [activeContactId]);

  // ── Load conversation list ──────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    const v = ++fetchVersion.current;
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Conversation[] = await res.json();
      if (v < fetchVersion.current) return; // stale response
      if (!Array.isArray(data)) return;

      setConversations((prev) => {
        const next = data.map((c) => {
          if (pendingRead.current.has(c.contact_id))
            return { ...c, unread_count: 0 };
          if (c.contact_id === activeContactIdRef.current)
            return { ...c, unread_count: 0 };
          return c;
        });
        // Skip re-render if nothing meaningful changed
        const changed =
          prev.length !== next.length ||
          prev.some((c, i) => {
            const n = next[i];
            return (
              !n ||
              c.contact_id !== n.contact_id ||
              c.unread_count !== n.unread_count ||
              c.last_message !== n.last_message ||
              c.last_message_at !== n.last_message_at ||
              c.name !== n.name
            );
          });
        return changed ? next : prev;
      });
    } catch (e) {
      console.error("loadConversations:", e);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // ── Load messages for a conversation (server-side route bypasses RLS) ──
  const loadMessages = useCallback(async (contactId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages?contactId=${contactId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Message[] = await res.json();
      if (!Array.isArray(data)) return;
      setMessages((prev) => ({ ...prev, [contactId]: data }));
    } catch (e) {
      console.error("loadMessages:", e);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ── Mark conversation as read ────────────────────────────────────────────
  const markAsRead = useCallback((contactId: string) => {
    if (pendingRead.current.has(contactId)) return;
    pendingRead.current.add(contactId);
    // Optimistic: zero badge immediately
    setConversations((prev) =>
      prev.map((c) =>
        c.contact_id === contactId ? { ...c, unread_count: 0 } : c
      )
    );
    fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    })
      .then(() => pendingRead.current.delete(contactId))
      .catch(() => pendingRead.current.delete(contactId));
  }, []);

  // ── Send a message (optimistic) ──────────────────────────────────────────
  const sendMessage = useCallback(
    async (contactId: string, body: string) => {
      const optimisticId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimistic: Message = {
        id: optimisticId,
        contact_id: contactId,
        twilio_sid: null,
        direction: "outbound",
        body,
        status: "sending",
        is_read: true,
        created_at: now,
      };

      // Add optimistic message
      setMessages((prev) => ({
        ...prev,
        [contactId]: [...(prev[contactId] ?? []), optimistic],
      }));

      // Update conversation preview + re-sort
      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.contact_id === contactId
            ? {
                ...c,
                last_message: body,
                last_direction: "outbound" as const,
                last_message_at: now,
              }
            : c
        );
        return [...updated].sort(
          (a, b) =>
            new Date(b.last_message_at).getTime() -
            new Date(a.last_message_at).getTime()
        );
      });

      try {
        const res = await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId, body }),
        });
        if (!res.ok) throw new Error(await res.text());
        const sent: Message = await res.json();
        // Replace optimistic with real message
        setMessages((prev) => ({
          ...prev,
          [contactId]: (prev[contactId] ?? []).map((m) =>
            m.id === optimisticId ? sent : m
          ),
        }));
      } catch (e) {
        // Rollback on failure
        setMessages((prev) => ({
          ...prev,
          [contactId]: (prev[contactId] ?? []).filter(
            (m) => m.id !== optimisticId
          ),
        }));
        throw e;
      }
    },
    []
  );

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel("chlore-messages-rt-v1")
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "messages" },
        (payload: { new: Message }) => {
          const msg = payload.new;

          // Play sound for inbound
          if (msg.direction === "inbound") {
            playNotificationSound();
          }

          // Append to loaded message list (dedup)
          setMessages((prev) => {
            if (!(msg.contact_id in prev)) return prev;
            const existing = prev[msg.contact_id];
            if (existing.some((m) => m.id === msg.id)) return prev;
            return { ...prev, [msg.contact_id]: [...existing, msg] };
          });

          // Update conversation list
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.contact_id === msg.contact_id);
            if (idx === -1) {
              // New contact — reload list
              loadConversations();
              return prev;
            }
            const isActive =
              activeContactIdRef.current === msg.contact_id;
            const updated = prev.map((c, i) => {
              if (i !== idx) return c;
              return {
                ...c,
                last_message: msg.body,
                last_direction: msg.direction,
                last_message_at: msg.created_at,
                unread_count:
                  msg.direction === "inbound" &&
                  !isActive &&
                  !pendingRead.current.has(c.contact_id)
                    ? c.unread_count + 1
                    : c.unread_count,
              };
            });
            return [...updated].sort(
              (a, b) =>
                new Date(b.last_message_at).getTime() -
                new Date(a.last_message_at).getTime()
            );
          });

          // Auto-mark as read if this conversation is active
          if (
            msg.direction === "inbound" &&
            msg.contact_id === activeContactIdRef.current
          ) {
            markAsRead(msg.contact_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadConversations, markAsRead]);

  return {
    conversations,
    messages,
    activeContactId,
    setActiveContactId,
    loadMessages,
    sendMessage,
    markAsRead,
    loadingConversations,
    loadingMessages,
  };
}
