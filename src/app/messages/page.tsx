"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Conversation, Message } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { formatPhone, formatMessageTime, formatFullTime, getInitials } from "@/lib/utils";
import { Search, Send } from "lucide-react";

export default function MessagesPage() {
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevMsgCount = useRef(0);
  const messagesLoadedFor = useRef<string | null>(null);
  const selectedContactRef = useRef<string | null>(null);
  const fetchVersion = useRef(0);
  const pendingRead = useRef<Set<string>>(new Set());

  const markAsRead = useCallback((contactId: string) => {
    pendingRead.current.add(contactId);
    fetch("/api/messages/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId }),
    })
      .then(() => pendingRead.current.delete(contactId))
      .catch(() => pendingRead.current.delete(contactId));
  }, []);

  const fetchConversations = useCallback(async () => {
    const v = ++fetchVersion.current;
    try {
      const res = await fetch("/api/conversations");
      const data: Conversation[] = await res.json();
      if (v < fetchVersion.current) return;
      if (!Array.isArray(data)) return;
      setConversations((prev) => {
        const next = data.map((c) => {
          if (c.contact_id === selectedContactRef.current) return { ...c, unread_count: 0 };
          if (pendingRead.current.has(c.contact_id)) return { ...c, unread_count: 0 };
          return c;
        });
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

  const fetchMessages = useCallback(
    async (contactId: string) => {
      const isInitial = messagesLoadedFor.current !== contactId;
      if (isInitial) setLoadingMessages(true);
      try {
        const res = await fetch(`/api/messages?contactId=${contactId}`);
        const data: Message[] = await res.json();
        if (!Array.isArray(data)) return;
        if (isInitial) {
          setMessages(data);
          messagesLoadedFor.current = contactId;
          prevMsgCount.current = data.length;
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
          }, 0);
        } else {
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            const newOnes = data.filter((m) => !ids.has(m.id));
            return newOnes.length === 0 ? prev : [...prev, ...newOnes];
          });
        }
        markAsRead(contactId);
      } catch (err) {
        console.error("fetchMessages error:", err);
      } finally {
        if (isInitial) setLoadingMessages(false);
      }
    },
    [markAsRead]
  );

  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    fetchConversations();
    const t = setInterval(fetchConversations, 3000);
    return () => clearInterval(t);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedContact) return;
    messagesLoadedFor.current = null;
    fetchMessages(selectedContact);
    const t = setInterval(() => fetchMessages(selectedContact), 3000);
    return () => clearInterval(t);
  }, [selectedContact, fetchMessages]);

  useEffect(() => {
    let channel: ReturnType<typeof supabaseBrowser.channel> | null = null;
    try {
      channel = supabaseBrowser
        .channel("messages-insert-v2")
        .on(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          "postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "messages" },
          (payload: { new: Message }) => {
            const msg = payload.new;
            if (msg.contact_id === selectedContactRef.current && msg.direction === "inbound") {
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                return [...prev, msg];
              });
              markAsRead(msg.contact_id);
            }
            fetchConversations();
          }
        )
        .subscribe();
    } catch (e) {
      console.warn("Realtime init failed:", e);
    }
    return () => { if (channel) supabaseBrowser.removeChannel(channel); };
  }, [fetchConversations, markAsRead]);

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

  const selectConversation = (contactId: string) => {
    selectedContactRef.current = contactId;
    setSelectedContact(contactId);
    setEditingContact(false);
    setConversations((prev) =>
      prev.map((c) => (c.contact_id === contactId ? { ...c, unread_count: 0 } : c))
    );
    markAsRead(contactId);
    const conv = conversations.find((c) => c.contact_id === contactId);
    if (conv) {
      setContactName(conv.name || "");
      setContactNotes(conv.notes || "");
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedContact || sending) return;
    const body = newMessage.trim();
    setSending(true);
    const optimisticId = `temp-${Date.now()}`;
    const now = new Date().toISOString();
    const optimisticMsg: Message = {
      id: optimisticId, contact_id: selectedContact, twilio_sid: null,
      direction: "outbound", body, status: "sending", is_read: true, created_at: now,
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
        const sent: Message = await res.json();
        setMessages((prev) => prev.map((m) => (m.id === optimisticId ? sent : m)));
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
      console.error(e);
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

  return (
    <div className="h-screen flex overflow-hidden bg-[#060f1f]">
      {/* Sidebar conversations */}
      <aside className="w-[320px] flex-shrink-0 flex flex-col border-r border-navy-800 bg-navy-950/50">
        <div className="p-3 border-b border-white/10">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#38b6d2]/50"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-[#38b6d2]/30 border-t-[#38b6d2] rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-12">
              {search ? "Aucun résultat" : "Aucune conversation"}
            </p>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.contact_id}
                onClick={() => selectConversation(conv.contact_id)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                  selectedContact === conv.contact_id
                    ? "bg-[#38b6d2]/10 border-r-2 border-[#38b6d2]"
                    : "hover:bg-white/5"
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold ${conv.unread_count > 0 ? "bg-gradient-to-br from-[#38b6d2] to-[#1a8fa8] text-white" : "bg-white/10 text-gray-300"}`}>
                  {getInitials(conv.name, conv.phone)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-sm truncate ${conv.unread_count > 0 ? "font-semibold text-white" : "font-medium text-gray-300"}`}>
                      {conv.name || formatPhone(conv.phone)}
                    </span>
                    <span className="text-[11px] text-gray-600 flex-shrink-0 ml-2">
                      {formatMessageTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-500 truncate">
                      {conv.last_direction === "outbound" && <span className="text-[#38b6d2]/60">Toi: </span>}
                      {conv.last_message}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-[#38b6d2] text-white text-[11px] font-semibold flex items-center justify-center px-1">
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
      <main className="flex-1 flex flex-col">
        {!selectedContact ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3">
                <Send size={22} className="text-gray-600" />
              </div>
              <p className="text-gray-600 text-sm">Sélectionne une conversation</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex-shrink-0 border-b border-white/10 bg-[#060f1f]/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#38b6d2]/20 border border-[#38b6d2]/20 flex items-center justify-center text-sm font-semibold text-[#38b6d2]">
                  {selectedConv && getInitials(selectedConv.name, selectedConv.phone)}
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {selectedConv?.name || formatPhone(selectedConv?.phone || "")}
                  </h2>
                  <p className="text-[11px] text-gray-500 font-mono">{selectedConv && formatPhone(selectedConv.phone)}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingContact(!editingContact)}
                className="text-gray-500 hover:text-[#38b6d2] transition p-2 rounded-lg hover:bg-white/5 text-xs"
              >
                Modifier
              </button>
            </div>

            {editingContact && (
              <div className="flex-shrink-0 border-b border-white/10 bg-white/5 px-4 py-3">
                <div className="flex gap-2 mb-2">
                  <input type="text" placeholder="Nom" value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#38b6d2]/50" />
                  <button onClick={saveContact} className="px-4 py-1.5 bg-[#38b6d2] hover:bg-[#1a8fa8] text-white text-sm font-medium rounded-lg transition">
                    Sauvegarder
                  </button>
                </div>
                <input type="text" placeholder="Notes" value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#38b6d2]/50" />
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-5 h-5 border-2 border-[#38b6d2]/30 border-t-[#38b6d2] rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-600 text-sm">Aucun message</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.direction === "outbound" ? "bg-gradient-to-br from-[#38b6d2] to-[#1a8fa8] text-white" : "bg-gradient-to-br from-[#1a3461] to-[#0f2241] border border-[#38b6d2]/10"}`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                      <p className={`text-[10px] mt-1 ${msg.direction === "outbound" ? "text-white/50" : "text-gray-500"}`}>
                        {formatFullTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-white/10 bg-[#060f1f]/80 p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder="Écrire un message..."
                  rows={1}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#38b6d2]/50 resize-none"
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
                  className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-r from-[#38b6d2] to-[#1a8fa8] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-30 transition"
                >
                  {sending ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-700 mt-1.5 pl-1">Entrée pour envoyer · Shift+Entrée pour nouvelle ligne</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
