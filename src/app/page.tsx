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
  // Track previous message count to know when to scroll
  const prevMsgCount = useRef(0);
  // Track which contact's messages are loaded (to show spinner only on first open)
  const messagesLoadedFor = useRef<string | null>(null);
  // Mirror of selectedContact for use inside async callbacks (avoids stale closures)
  const selectedContactRef = useRef<string | null>(null);
  // Version counter: discard responses that arrived out of order
  const fetchVersion = useRef(0);
  // Contacts that have been marked as read locally (pending DB confirmation)
  // Badge stays 0 for these until DB confirms unread_count = 0
  const pendingRead = useRef<Set<string>>(new Set());

  // ─── Mark as read ─────────────────────────────────────────────────────────────
  const markAsRead = useCallback((contactId: string) => {
    pendingRead.current.add(contactId);
    fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    }).catch(() => {/* silent */});
  }, []);

  // ─── Conversations ────────────────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    const v = ++fetchVersion.current;
    try {
      const res = await fetch("/api/conversations");
      const data: Conversation[] = await res.json();
      if (v < fetchVersion.current) return; // stale response, discard
      if (!Array.isArray(data)) return;

      setConversations((prev) => {
        const next = data.map((c) => {
          // Currently open conversation → always 0
          if (c.contact_id === selectedContactRef.current) {
            return { ...c, unread_count: 0 };
          }
          // Conversation was marked as read locally (pending DB confirmation)
          if (pendingRead.current.has(c.contact_id)) {
            // Once DB confirms 0, remove from pending
            if (c.unread_count === 0) pendingRead.current.delete(c.contact_id);
            return { ...c, unread_count: 0 };
          }
          return c;
        });

        // Silent merge: only update state if something actually changed
        // This prevents unnecessary re-renders every 3s
        const changed =
          prev.length !== next.length ||
          prev.some((c, i) => {
            const n = next[i];
            return (
              c.contact_id !== n.contact_id ||
              c.unread_count !== n.unread_count ||
              c.last_message !== n.last_message ||
              c.last_message_at !== n.last_message_at ||
              c.name !== n.name
            );
          });

        return changed ? next : prev;
      });
    } catch (err) {
      console.error("fetchConversations error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Messages ─────────────────────────────────────────────────────────────────
  const fetchMessages = useCallback(
    async (contactId: string) => {
      const isInitial = messagesLoadedFor.current !== contactId;
      if (isInitial) setLoadingMessages(true);
      try {
        const res = await fetch(`/api/messages?contactId=${contactId}`);
        const data: Message[] = await res.json();
        if (!Array.isArray(data)) return;

        if (isInitial) {
          // First load: replace all messages, scroll instantly to bottom
          setMessages(data);
          messagesLoadedFor.current = contactId;
          prevMsgCount.current = data.length;
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
          }, 0);
        } else {
          // Subsequent polls: only append NEW messages (compare by ID)
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newOnes = data.filter((m) => !existingIds.has(m.id));
            return newOnes.length === 0 ? prev : [...prev, ...newOnes];
          });
        }

        // Mark as read every time messages are fetched for the open conversation
        markAsRead(contactId);
      } catch (err) {
        console.error("fetchMessages error:", err);
      } finally {
        if (isInitial) setLoadingMessages(false);
      }
    },
    [markAsRead]
  );

  // ─── Scroll to bottom only when new messages arrive ───────────────────────────
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  // ─── Poll conversations every 3s ─────────────────────────────────────────────
  useEffect(() => {
    fetchConversations();
    const t = setInterval(fetchConversations, 3000);
    return () => clearInterval(t);
  }, [fetchConversations]);

  // ─── Poll messages every 3s when a conversation is open ───────────────────────
  useEffect(() => {
    if (!selectedContact) return;
    messagesLoadedFor.current = null; // force initial load for new contact
    fetchMessages(selectedContact);
    const t = setInterval(() => fetchMessages(selectedContact), 3000);
    return () => clearInterval(t);
  }, [selectedContact, fetchMessages]);

  // ─── Supabase Realtime ────────────────────────────────────────────────────────
  useEffect(() => {
    let channel: ReturnType<typeof supabaseBrowser.channel> | null = null;
    try {
      channel = supabaseBrowser
        .channel("messages-insert")
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "messages" },
          (payload: { new: Message }) => {
            const msg = payload.new;
            // Append to chat if this conversation is currently open
            if (msg.contact_id === selectedContactRef.current && msg.direction === "inbound") {
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
              markAsRead(msg.contact_id);
            }
            // Trigger immediate DB refresh for sidebar
            fetchConversations();
          }
        )
        .subscribe((s) => {
          if (s === "CHANNEL_ERROR") console.warn("Realtime unavailable — using 3s poll");
        });
    } catch (e) {
      console.warn("Realtime init failed:", e);
    }
    return () => { if (channel) supabaseBrowser.removeChannel(channel); };
  }, [fetchConversations, markAsRead]);

  // ─── Auto-sync Twilio every 15s (catches messages sent via Make/API) ──────────
  useEffect(() => {
    const sync = async (since: string) => {
      try {
        await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ since }),
        });
        fetchConversations();
      } catch (e) {
        console.error("autoSync error:", e);
      }
    };
    sync(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const t = setInterval(
      () => sync(new Date(Date.now() - 20 * 60 * 1000).toISOString()),
      15000
    );
    return () => clearInterval(t);
  }, [fetchConversations]);

  // ─── Select conversation ──────────────────────────────────────────────────────
  const selectConversation = (contactId: string) => {
    selectedContactRef.current = contactId;
    setSelectedContact(contactId);
    setMobileShowChat(true);
    setEditingContact(false);
    // Instantly zero the badge locally
    setConversations((prev) =>
      prev.map((c) => (c.contact_id === contactId ? { ...c, unread_count: 0 } : c))
    );
    // Mark as read immediately (don't wait for fetchMessages)
    markAsRead(contactId);
    const conv = conversations.find((c) => c.contact_id === contactId);
    if (conv) {
      setContactName(conv.name || "");
      setContactNotes(conv.notes || "");
    }
  };

  // ─── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedContact || sending) return;
    const body = newMessage.trim();
    setSending(true);

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
        // Replace optimistic message with real one
        const sent: Message = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? sent : m))
        );
        inputRef.current?.focus();
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setNewMessage(body);
      }
    } catch {
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
      fetchConversations();
    } catch (e) {
      console.error("saveContact error:", e);
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
                  <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold ${conv.unread_count > 0 ? "bg-gradient-to-br from-pool to-pool-dark text-white" : "bg-navy-800 text-navy-300"}`}>
                    {getInitials(conv.name, conv.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm truncate ${conv.unread_count > 0 ? "font-semibold text-white" : "font-medium text-white"}`}>
                        {conv.name || formatPhone(conv.phone)}
                      </span>
                      <span className="text-[11px] text-navy-400 flex-shrink-0 ml-2">
                        {formatMessageTime(conv.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-navy-400 truncate">
                        {conv.last_direction === "outbound" && (
                          <span className="text-pool-light/60">Toi: </span>
                        )}
                        {conv.last_message}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-pool text-white text-[11px] font-semibold flex items-center justify-center px-1">
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
              {/* Chat header */}
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

              {/* Contact editor */}
              {editingContact && (
                <div className="flex-shrink-0 border-b border-navy-800 bg-navy-900/50 px-4 py-3">
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

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-6 h-6 border-2 border-pool/30 border-t-pool rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
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

              {/* Input */}
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
