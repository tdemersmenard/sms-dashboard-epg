"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Conversation, Message } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { formatPhone, formatMessageTime, formatFullTime, getInitials } from "@/lib/utils";

export default function Dashboard() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState("");
  const [editingContact, setEditingContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevMessageCount = useRef(0);
  const messagesLoadedFor = useRef<string | null>(null);
  const selectedContactRef = useRef<string | null>(null);
  const fetchVersion = useRef(0);
  // When did the user last mark each conversation as read (ms)
  const markReadAt = useRef<Map<string, number>>(new Map());

  const setSelectedContactAndRef = (id: string | null) => {
    selectedContactRef.current = id;
    setSelectedContact(id);
  };

  // ─── Single source of truth: DB ──────────────────────────────────────────────
  // Called from: poll, Realtime signal, autoSync, sendMessage success
  const fetchConversations = useCallback(async () => {
    const v = ++fetchVersion.current;
    try {
      const res = await fetch("/api/conversations");
      const data: Conversation[] = await res.json();
      // Discard if a newer request has already been fired
      if (v < fetchVersion.current) return;
      if (!Array.isArray(data)) return;
      const now = Date.now();
      setConversations(
        data.map((c) => {
          // Never show badge for the conversation the user is currently viewing
          if (c.contact_id === selectedContactRef.current) {
            return { ...c, unread_count: 0 };
          }
          // If user marked this conversation as read within the last 3s,
          // keep badge at 0 even if the DB hasn't fully processed is_read=true yet
          const readAt = markReadAt.current.get(c.contact_id) ?? 0;
          if (now - readAt < 3000) {
            return { ...c, unread_count: 0 };
          }
          return c;
        })
      );
    } catch (err) {
      console.error("fetchConversations error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Messages ─────────────────────────────────────────────────────────────────
  const fetchMessages = useCallback(async (contactId: string) => {
    const isInitial = messagesLoadedFor.current !== contactId;
    if (isInitial) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages?contactId=${contactId}`);
      const data: Message[] = await res.json();
      if (!Array.isArray(data)) return;
      setMessages(data);
      messagesLoadedFor.current = contactId;
      // Record read time so fetchConversations keeps badge at 0 for a bit
      markReadAt.current.set(contactId, Date.now());
      setConversations((prev) =>
        prev.map((c) =>
          c.contact_id === contactId ? { ...c, unread_count: 0 } : c
        )
      );
      fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
    } catch (err) {
      console.error("fetchMessages error:", err);
    } finally {
      if (isInitial) setLoadingMessages(false);
    }
  }, []);

  // ─── Poll conversations toutes les 2s ────────────────────────────────────────
  useEffect(() => {
    fetchConversations();
    const t = setInterval(fetchConversations, 2000);
    return () => clearInterval(t);
  }, [fetchConversations]);

  // ─── Poll messages toutes les 3s quand une conversation est ouverte ──────────
  useEffect(() => {
    if (!selectedContact) return;
    prevMessageCount.current = 0;
    messagesLoadedFor.current = null;
    fetchMessages(selectedContact);
    const t = setInterval(() => fetchMessages(selectedContact), 3000);
    return () => clearInterval(t);
  }, [selectedContact, fetchMessages]);

  // ─── Supabase Realtime ────────────────────────────────────────────────────────
  // Realtime = signal only. It triggers an immediate DB fetch for conversations,
  // and directly appends the message to the chat if the conversation is open.
  // No direct state mutation for conversations from the payload — DB is king.
  useEffect(() => {
    let channel: ReturnType<typeof supabaseBrowser.channel> | null = null;
    try {
      channel = supabaseBrowser
        .channel("db-messages")
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "messages" },
          (payload: { new: Message }) => {
            const msg = payload.new;
            // If the conversation is open: append the message instantly to the chat
            if (msg.contact_id === selectedContactRef.current) {
              if (msg.direction === "inbound") {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === msg.id)) return prev;
                  return [...prev, msg];
                });
                markReadAt.current.set(msg.contact_id, Date.now());
                fetch("/api/messages/read", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contactId: msg.contact_id }),
                });
              }
            }
            // Always: trigger an immediate DB refresh for the conversations sidebar
            // This is the ONLY way conversations state is updated — from DB
            fetchConversations();
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR")
            console.warn("Realtime unavailable — polling fallback active (2s)");
        });
    } catch (err) {
      console.warn("Realtime init error:", err);
    }
    return () => {
      if (channel) supabaseBrowser.removeChannel(channel);
    };
  }, [fetchConversations]);

  // ─── Auto-sync Twilio toutes les 15s ─────────────────────────────────────────
  // Capture les messages envoyés via Make/API Twilio (pas de webhook pour outbound)
  useEffect(() => {
    const sync = async (since: string) => {
      try {
        await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ since }),
        });
        fetchConversations();
      } catch (err) {
        console.error("autoSync error:", err);
      }
    };
    // Initial: 24h window to catch everything on load
    sync(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    // Every 15s: 20min window to catch new Make messages quickly
    const t = setInterval(
      () => sync(new Date(Date.now() - 20 * 60 * 1000).toISOString()),
      15000
    );
    return () => clearInterval(t);
  }, [fetchConversations]);

  // ─── Scroll vers le bas uniquement quand un nouveau message arrive ────────────
  useEffect(() => {
    if (messages.length > prevMessageCount.current)
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    prevMessageCount.current = messages.length;
  }, [messages]);

  // ─── Sélectionner une conversation ───────────────────────────────────────────
  const selectConversation = (contactId: string) => {
    setSelectedContactAndRef(contactId);
    markReadAt.current.set(contactId, Date.now());
    setMobileShowChat(true);
    const conv = conversations.find((c) => c.contact_id === contactId);
    if (conv) {
      setContactName(conv.name || "");
      setContactNotes(conv.notes || "");
    }
    setEditingContact(false);
    setConversations((prev) =>
      prev.map((c) =>
        c.contact_id === contactId ? { ...c, unread_count: 0 } : c
      )
    );
  };

  // ─── Envoyer un message ───────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedContact || sending) return;
    const body = newMessage.trim();
    setSending(true);

    // Optimistic: add message immediately + move conversation to top
    const optimisticId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    const optimisticMsg: Message = {
      id: optimisticId,
      contact_id: selectedContact,
      twilio_sid: null,
      direction: "outbound",
      body,
      status: "sending",
      is_read: true,
      created_at: now,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setConversations((prev) => {
      const updated = prev.map((c) =>
        c.contact_id === selectedContact
          ? { ...c, last_message: body, last_direction: "outbound" as const, last_message_at: now }
          : c
      );
      return [...updated].sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
    });
    setNewMessage("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedContact, body }),
      });
      if (res.ok) {
        await fetchMessages(selectedContact);
        inputRef.current?.focus();
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setNewMessage(body);
      }
    } catch (err) {
      console.error("sendMessage error:", err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setNewMessage(body);
    } finally {
      setSending(false);
    }
  };

  const saveContact = async () => {
    if (!selectedContact) return;
    try {
      await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedContact, name: contactName, notes: contactNotes }),
      });
      setEditingContact(false);
      await fetchConversations();
    } catch (err) {
      console.error("saveContact error:", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const filtered = conversations.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.phone.includes(q) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.last_message && c.last_message.toLowerCase().includes(q))
    );
  });

  const selectedConv = conversations.find((c) => c.contact_id === selectedContact);
  const totalUnread = conversations.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-navy-800 bg-navy-950/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {mobileShowChat && (
            <button
              onClick={() => setMobileShowChat(false)}
              className="md:hidden text-pool-light hover:text-white transition p-1"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pool to-pool-dark flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white tracking-tight">Entretien Piscine Granby</h1>
            <p className="text-[11px] text-pool-light/60">SMS Dashboard</p>
          </div>
        </div>
        {totalUnread > 0 && (
          <div className="flex items-center gap-2 bg-pool/10 border border-pool/20 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-pool pulse-dot" />
            <span className="text-xs font-medium text-pool-light">
              {totalUnread} non lu{totalUnread > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className={`${mobileShowChat ? "hidden md:flex" : "flex"} w-full md:w-[340px] lg:w-[380px] flex-shrink-0 flex-col border-r border-navy-800 bg-navy-950/50`}>
          <div className="p-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-navy-900/80 border border-navy-700/50 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder:text-navy-500 focus:outline-none input-glow transition"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-pool/30 border-t-pool rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-navy-500 text-sm">{search ? "Aucun résultat" : "Aucune conversation"}</p>
              </div>
            ) : (
              filtered.map((conv) => (
                <button
                  key={conv.contact_id}
                  onClick={() => selectConversation(conv.contact_id)}
                  className={`conversation-item w-full text-left px-4 py-3 flex items-start gap-3 ${selectedContact === conv.contact_id ? "active" : ""}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold ${conv.unread_count > 0 ? "bg-gradient-to-br from-pool to-pool-dark text-white" : "bg-navy-800 text-navy-300"}`}>
                    {getInitials(conv.name, conv.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-sm text-white truncate">
                        {conv.name || formatPhone(conv.phone)}
                      </span>
                      <span className="text-[11px] text-navy-400 flex-shrink-0 ml-2">
                        {formatMessageTime(conv.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-navy-400 truncate pr-2">
                        {conv.last_direction === "outbound" && (
                          <span className="text-pool-light/50">Toi: </span>
                        )}
                        {conv.last_message}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-pool text-white text-[11px] font-semibold flex items-center justify-center">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat */}
        <main className={`${mobileShowChat ? "flex" : "hidden md:flex"} flex-1 flex-col bg-[#060f1f]`}>
          {!selectedContact ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-navy-900/50 border border-navy-800 flex items-center justify-center mx-auto mb-4">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-navy-600">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-navy-500 text-sm">Sélectionne une conversation</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 border-b border-navy-800 bg-navy-950/50 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pool/20 to-pool-dark/20 border border-pool/20 flex items-center justify-center text-sm font-semibold text-pool-light">
                    {selectedConv && getInitials(selectedConv.name, selectedConv.phone)}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      {selectedConv?.name || formatPhone(selectedConv?.phone || "")}
                    </h2>
                    <p className="text-[11px] text-navy-400 font-mono">
                      {selectedConv && formatPhone(selectedConv.phone)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingContact(!editingContact)}
                  className="text-navy-400 hover:text-pool-light transition p-2 rounded-lg hover:bg-navy-800/50"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </button>
              </div>

              {editingContact && (
                <div className="flex-shrink-0 border-b border-navy-800 bg-navy-900/50 px-4 py-3 animate-slide-in">
                  <div className="flex gap-3 mb-2">
                    <input
                      type="text"
                      placeholder="Nom du contact"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="flex-1 bg-navy-800/60 border border-navy-700/50 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-navy-500 focus:outline-none input-glow"
                    />
                    <button
                      onClick={saveContact}
                      className="px-4 py-1.5 bg-pool hover:bg-pool-dark text-white text-sm font-medium rounded-lg transition"
                    >
                      Sauvegarder
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Notes (ex: Ouverture piscine, adresse...)"
                    value={contactNotes}
                    onChange={(e) => setContactNotes(e.target.value)}
                    className="w-full bg-navy-800/60 border border-navy-700/50 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-navy-500 focus:outline-none input-glow"
                  />
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-pool/30 border-t-pool rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-navy-500 text-sm">Aucun message</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.direction === "outbound" ? "bubble-out" : "bubble-in"}`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                        <p className={`text-[10px] mt-1 ${msg.direction === "outbound" ? "text-white/50" : "text-navy-500"}`}>
                          {formatFullTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="flex-shrink-0 border-t border-navy-800 bg-navy-950/50 backdrop-blur-sm p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Écrire un message..."
                    rows={1}
                    className="flex-1 bg-navy-900/80 border border-navy-700/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-navy-500 focus:outline-none input-glow resize-none transition"
                    style={{ maxHeight: "120px" }}
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement;
                      t.style.height = "auto";
                      t.style.height = Math.min(t.scrollHeight, 120) + "px";
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sending}
                    className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-r from-pool to-pool-dark text-white flex items-center justify-center hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="m22 2-7 20-4-9-9-4z" />
                        <path d="m22 2-11 11" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-navy-600 mt-1.5 pl-1">
                  Entrée pour envoyer · Shift+Entrée pour sauter une ligne
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
