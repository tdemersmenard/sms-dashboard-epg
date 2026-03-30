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
  // Tracks when we last marked each conversation as read (ms timestamp)
  const lastReadAt = useRef<Record<string, number>>({});

  // Keep selectedContactRef in sync
  useEffect(() => {
    selectedContactRef.current = selectedContact;
  }, [selectedContact]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data: Conversation[] = await res.json();
      setConversations((prev) =>
        data.map((serverConv: Conversation) => {
          // Open conversation: always unread = 0
          if (serverConv.contact_id === selectedContactRef.current) {
            return { ...serverConv, unread_count: 0 };
          }
          const local = prev.find((c) => c.contact_id === serverConv.contact_id);
          // Local state is newer (Realtime update not yet in DB) → preserve it
          if (
            local &&
            new Date(local.last_message_at) > new Date(serverConv.last_message_at)
          ) {
            return local;
          }
          return serverConv;
        })
      );
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch messages for selected contact
  const fetchMessages = useCallback(async (contactId: string) => {
    const isInitial = messagesLoadedFor.current !== contactId;
    if (isInitial) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/messages?contactId=${contactId}`);
      const data = await res.json();
      setMessages(data);
      messagesLoadedFor.current = contactId;
      // Await mark-as-read so DB is updated before next fetchConversations poll
      lastReadAt.current[contactId] = Date.now();
      await fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      setConversations((prev) =>
        prev.map((c) => c.contact_id === contactId ? { ...c, unread_count: 0 } : c)
      );
    } catch (err) {
      console.error("Error fetching messages:", err);
    } finally {
      if (isInitial) setLoadingMessages(false);
    }
  }, []);

  // Initial load + polling (fallback si Realtime déconnecté)
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // Reload messages when selected contact changes
  useEffect(() => {
    if (selectedContact) {
      prevMessageCount.current = 0;
      messagesLoadedFor.current = null;
      fetchMessages(selectedContact);
      const interval = setInterval(() => fetchMessages(selectedContact), 10000);
      return () => clearInterval(interval);
    }
  }, [selectedContact, fetchMessages]);

  // Supabase Realtime — mises à jour instantanées
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

            // Nouveau message dans la conversation ouverte (inbound uniquement — outbound = optimistic)
            if (
              msg.contact_id === selectedContactRef.current &&
              msg.direction === "inbound"
            ) {
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
              // Marquer comme lu immédiatement
              fetch("/api/messages/read", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contactId: msg.contact_id }),
              });
            }

            // Mettre à jour la sidebar instantanément
            setConversations((prev) => {
              const contact = prev.find((c) => c.contact_id === msg.contact_id);
              if (!contact) {
                fetchConversations();
                return prev;
              }
              const isOpen = msg.contact_id === selectedContactRef.current;
              // Événement "tardif" = message créé avant qu'on ait lu la conversation
              const readAt = lastReadAt.current[msg.contact_id] ?? 0;
              const msgTime = new Date(msg.created_at).getTime();
              const isStale = msgTime <= readAt;
              const updated = prev.map((c) =>
                c.contact_id !== msg.contact_id
                  ? c
                  : {
                      ...c,
                      last_message: msg.body,
                      last_direction: msg.direction,
                      last_message_at: msg.created_at,
                      unread_count:
                        msg.direction === "outbound" || isOpen || isStale
                          ? c.unread_count
                          : c.unread_count + 1,
                    }
              );
              return [...updated].sort(
                (a, b) =>
                  new Date(b.last_message_at).getTime() -
                  new Date(a.last_message_at).getTime()
              );
            });
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            // Realtime indisponible — le polling de 10s prend le relais
            console.warn("Supabase Realtime unavailable, falling back to polling");
          }
        });
    } catch (err) {
      console.warn("Realtime init error:", err);
    }

    return () => {
      if (channel) supabaseBrowser.removeChannel(channel);
    };
  }, [fetchConversations]);

  // Scroll to bottom only when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = messages.length;
  }, [messages]);

  // Select a conversation
  const selectConversation = (contactId: string) => {
    setSelectedContact(contactId);
    setMobileShowChat(true);
    const conv = conversations.find((c) => c.contact_id === contactId);
    if (conv) {
      setContactName(conv.name || "");
      setContactNotes(conv.notes || "");
    }
    setEditingContact(false);
    lastReadAt.current[contactId] = Date.now();
    setConversations((prev) =>
      prev.map((c) => c.contact_id === contactId ? { ...c, unread_count: 0 } : c)
    );
  };

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedContact || sending) return;
    const body = newMessage.trim();
    setSending(true);

    // Optimistic update — show message instantly
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      contact_id: selectedContact,
      twilio_sid: null,
      direction: "outbound",
      body,
      status: "sending",
      is_read: true,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedContact, body }),
      });
      if (res.ok) {
        // Replace optimistic with real data
        await fetchMessages(selectedContact);
        fetchConversations();
        inputRef.current?.focus();
      } else {
        // Rollback on error
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setNewMessage(body);
      }
    } catch (err) {
      console.error("Error sending:", err);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setNewMessage(body);
    } finally {
      setSending(false);
    }
  };

  // Silent background sync — catches outbound Make messages not in DB yet
  const autoSync = useCallback(async (since?: string) => {
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(since ? { since } : {}),
      });
      await fetchConversations();
      if (selectedContactRef.current) {
        await fetchMessages(selectedContactRef.current);
      }
    } catch (err) {
      console.error("Auto-sync error:", err);
    }
  }, [fetchConversations, fetchMessages]);

  // On load: sync last 24h. Every 2 min: sync last 5 min.
  useEffect(() => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    autoSync(since24h);
    const interval = setInterval(() => {
      const since5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      autoSync(since5min);
    }, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoSync]);

  // Update contact info
  const saveContact = async () => {
    if (!selectedContact) return;
    try {
      await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selectedContact,
          name: contactName,
          notes: contactNotes,
        }),
      });
      setEditingContact(false);
      await fetchConversations();
    } catch (err) {
      console.error("Error updating contact:", err);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Filter conversations
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
            <h1 className="text-sm font-semibold text-white tracking-tight">
              Entretien Piscine Granby
            </h1>
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

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - conversations list */}
        <aside
          className={`${
            mobileShowChat ? "hidden md:flex" : "flex"
          } w-full md:w-[340px] lg:w-[380px] flex-shrink-0 flex-col border-r border-navy-800 bg-navy-950/50`}
        >
          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
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

          {/* Conversations list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-pool/30 border-t-pool rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <p className="text-navy-500 text-sm">
                  {search ? "Aucun résultat" : "Aucune conversation"}
                </p>
              </div>
            ) : (
              filtered.map((conv) => (
                <button
                  key={conv.contact_id}
                  onClick={() => selectConversation(conv.contact_id)}
                  className={`conversation-item w-full text-left px-4 py-3 flex items-start gap-3 ${
                    selectedContact === conv.contact_id ? "active" : ""
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold ${
                      conv.unread_count > 0
                        ? "bg-gradient-to-br from-pool to-pool-dark text-white"
                        : "bg-navy-800 text-navy-300"
                    }`}
                  >
                    {getInitials(conv.name, conv.phone)}
                  </div>

                  {/* Content */}
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

        {/* Chat area */}
        <main
          className={`${
            mobileShowChat ? "flex" : "hidden md:flex"
          } flex-1 flex-col bg-[#060f1f]`}
        >
          {!selectedContact ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-navy-900/50 border border-navy-800 flex items-center justify-center mx-auto mb-4">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-navy-600"
                  >
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
                  title="Modifier le contact"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                </button>
              </div>

              {/* Edit contact panel */}
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

              {/* Messages */}
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
                      className={`flex ${
                        msg.direction === "outbound" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                          msg.direction === "outbound" ? "bubble-out" : "bubble-in"
                        }`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                        <p
                          className={`text-[10px] mt-1 ${
                            msg.direction === "outbound"
                              ? "text-white/50"
                              : "text-navy-500"
                          }`}
                        >
                          {formatFullTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Compose */}
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
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = Math.min(target.scrollHeight, 120) + "px";
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
