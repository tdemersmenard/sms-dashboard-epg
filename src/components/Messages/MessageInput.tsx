"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Zap } from "lucide-react";
import { MessageTemplate } from "@/lib/types";

interface Props {
  onSend: (body: string) => Promise<void>;
  templates: MessageTemplate[];
  disabled?: boolean;
  autoFocus?: boolean;
}

export default function MessageInput({
  onSend,
  templates,
  disabled = false,
  autoFocus = false,
}: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus when conversation opens
  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  // Auto-resize textarea
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  // Close template dropdown when clicking outside
  useEffect(() => {
    if (!showTemplates) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTemplates]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    try {
      await onSend(body);
    } catch {
      // Restore text on failure
      setText(body);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const applyTemplate = (tpl: MessageTemplate) => {
    setText(tpl.body);
    setShowTemplates(false);
    textareaRef.current?.focus();
    setTimeout(resize, 0);
  };

  const hasText = text.trim().length > 0;

  return (
    <div
      ref={containerRef}
      className="flex-shrink-0 bg-gray-50 border-t border-gray-200 px-3 py-3 relative"
    >
      {/* Template dropdown — renders above the input */}
      {showTemplates && templates.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-lg border border-gray-100 max-h-[300px] overflow-y-auto z-50">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => applyTemplate(tpl)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
            >
              <p className="text-sm font-semibold text-gray-800">{tpl.name}</p>
              <p className="text-xs text-gray-400 truncate mt-0.5">
                {tpl.body}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Input wrapper */}
      <div
        className="flex items-end gap-2 bg-white border border-gray-200 px-3 py-2 transition-shadow focus-within:shadow-sm focus-within:border-gray-300"
        style={{ borderRadius: 22 }}
      >
        {/* Templates button */}
        <button
          type="button"
          onClick={() => setShowTemplates((v) => !v)}
          className={`flex-shrink-0 p-1 rounded-full transition-colors mb-0.5 ${
            showTemplates
              ? "text-blue-500 bg-blue-50"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          }`}
          title="Templates"
        >
          <Zap size={17} />
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            resize();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message..."
          rows={1}
          disabled={disabled || sending}
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none py-0.5 leading-relaxed disabled:opacity-50"
          style={{ maxHeight: 120 }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!hasText || sending || disabled}
          className="flex-shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center transition-colors mb-0.5"
          style={{
            backgroundColor: hasText ? "#3b82f6" : "#d1d5db",
          }}
        >
          {sending ? (
            <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={15} className="text-white translate-x-px" />
          )}
        </button>
      </div>

      <p className="text-[10px] text-gray-400 mt-1.5 pl-2">
        Entrée pour envoyer · Shift+Entrée pour nouvelle ligne
      </p>
    </div>
  );
}
