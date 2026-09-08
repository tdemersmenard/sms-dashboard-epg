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
      className="flex-shrink-0 bg-page border-t border-line px-3 py-3 relative"
    >
      {/* Template dropdown — renders above the input */}
      {showTemplates && templates.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-sur rounded-xl border border-line max-h-[300px] overflow-y-auto z-50">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => applyTemplate(tpl)}
              className="w-full text-left px-4 py-3 hover:bg-chip transition-colors border-b border-line last:border-0"
            >
              <p className="text-sm font-semibold text-ink">{tpl.name}</p>
              <p className="text-xs text-mut truncate mt-0.5">
                {tpl.body}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Input wrapper */}
      <div
        className="flex items-end gap-2 bg-sur border border-line px-3 py-2 transition-shadow focus-within:border-acc"
        style={{ borderRadius: 22 }}
      >
        {/* Templates button */}
        <button
          type="button"
          onClick={() => setShowTemplates((v) => !v)}
          className={`flex-shrink-0 p-1 rounded-full transition-colors mb-0.5 ${
            showTemplates
              ? "text-acc bg-chip"
              : "text-mut hover:text-ink hover:bg-chip"
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
          className="flex-1 bg-transparent text-sm text-ink placeholder:text-mut resize-none focus:outline-none py-0.5 leading-relaxed disabled:opacity-50"
          style={{ maxHeight: 120 }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!hasText || sending || disabled}
          className={`flex-shrink-0 w-[34px] h-[34px] rounded-full flex items-center justify-center transition-colors mb-0.5 ${
            hasText ? "btn-glow" : "bg-chip text-mut"
          }`}
        >
          {sending ? (
            <div className="w-3.5 h-3.5 border-2 border-accink border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send size={15} className="translate-x-px" />
          )}
        </button>
      </div>

      <p className="text-[10px] text-mut mt-1.5 pl-2">
        Entrée pour envoyer · Shift+Entrée pour nouvelle ligne
      </p>
    </div>
  );
}
