"use client";

import { useState, useRef, useEffect } from "react";
import { Terminal, X, Send, Loader2, ChevronDown } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  results?: string[];
}

export default function AdminTerminal() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [open, messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch("/api/admin/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await resp.json();
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.message || data.error || "Erreur inconnue",
          results: data.results,
        },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `Erreur: ${String(err)}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="hidden md:flex fixed md:bottom-6 md:right-6 z-50 w-12 h-12 btn-glow rounded-full items-center justify-center hover:opacity-90 transition-colors"
        title="Terminal AI"
      >
        {open ? <ChevronDown size={20} /> : <Terminal size={20} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-40 right-4 md:bottom-20 md:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm bg-sur rounded-2xl border border-line flex flex-col overflow-hidden" style={{ height: 420 }}>
          {/* Header */}
          <div className="bg-acc-grad px-4 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Terminal size={16} className="text-accink" />
              <span className="text-accink text-sm font-semibold font-display">Terminal AI</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-accink opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-xs text-mut text-center pt-4">
                Donne-moi une instruction en français.<br />
                Ex: "Marque le paiement de Jean Dupont comme reçu"
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                  m.role === "user"
                    ? "bg-acc-grad text-accink"
                    : "bg-chip text-ink"
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.results && m.results.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-line space-y-1">
                      {m.results.map((r, ri) => (
                        <p key={ri} className="text-[10px] text-pos font-mono">{r}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-chip rounded-xl px-3 py-2">
                  <Loader2 size={14} className="animate-spin text-mut" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-line p-2 flex-shrink-0 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Instruction..."
              rows={1}
              className="flex-1 text-xs resize-none border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-acc max-h-20"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="w-8 h-8 btn-glow rounded-lg flex items-center justify-center disabled:opacity-40 hover:opacity-90 flex-shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
