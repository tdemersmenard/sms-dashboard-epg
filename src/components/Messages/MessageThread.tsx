"use client";

import { useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Conversation, Message } from "@/lib/types";
import {
  formatPhone,
  formatFullTime,
  formatDateSeparator,
  getAvatarColor,
} from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function displayName(conv: Conversation): string {
  const first = conv.first_name && conv.first_name !== "Inconnu" ? conv.first_name : null;
  const last = conv.last_name && conv.last_name.trim() !== "" ? conv.last_name : null;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (conv.name && conv.name !== "Inconnu") return conv.name;
  return conv.phone ?? "Inconnu";
}

function getInitials(conv: Conversation): string {
  const name = displayName(conv);
  if (name === formatPhone(conv.phone)) return conv.phone.slice(-2);
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function statusIcon(status: string): string {
  if (status === "delivered" || status === "read") return "✓✓";
  if (status === "failed" || status === "undelivered") return "✕";
  return "✓";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface Props {
  conversation: Conversation;
  messages: Message[];
  loading: boolean;
}

export default function MessageThread({
  conversation,
  messages,
  loading,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  // Track IDs present on first render for this conversation
  const initialIdsRef = useRef<Set<string>>(new Set());
  const contactIdRef = useRef<string>("");

  // Reset initial IDs when conversation switches
  if (conversation.contact_id !== contactIdRef.current) {
    contactIdRef.current = conversation.contact_id;
    initialIdsRef.current = new Set(messages.map((m) => m.id));
  }

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0 && prevLengthRef.current === 0) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    }
    prevLengthRef.current = messages.length;
  }, [loading, messages.length]);

  // Smooth scroll when new messages arrive
  useEffect(() => {
    if (messages.length > 0 && prevLengthRef.current > 0 &&
        messages.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Update initial IDs after the first load completes
  useEffect(() => {
    if (!loading && initialIdsRef.current.size === 0 && messages.length > 0) {
      initialIdsRef.current = new Set(messages.map((m) => m.id));
    }
  }, [loading, messages]);

  const avatarBg = getAvatarColor(conversation.contact_id);
  const name = displayName(conversation);
  const initials = getInitials(conversation);

  // Build flat list with date separators
  const items = useMemo(() => {
    type Item =
      | { type: "separator"; key: string; label: string }
      | { type: "message"; key: string; message: Message };

    const result: Item[] = [];
    messages.forEach((msg, i) => {
      const prev = messages[i - 1];
      if (!prev || !isSameDay(prev.created_at, msg.created_at)) {
        result.push({
          type: "separator",
          key: `sep-${msg.created_at}`,
          label: formatDateSeparator(msg.created_at),
        });
      }
      result.push({ type: "message", key: msg.id, message: msg });
    });
    return result;
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-100 bg-white px-4 py-3 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold text-white"
          style={{ backgroundColor: avatarBg }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 truncate">
            {name}
          </h2>
          <p className="text-[11px] text-gray-400 font-mono">
            {formatPhone(conversation.phone)}
          </p>
        </div>
        <Link
          href={`/clients/${conversation.contact_id}`}
          className="flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-600 transition px-2 py-1.5 rounded-lg hover:bg-blue-50"
        >
          <ExternalLink size={13} />
          Fiche
        </Link>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-300 text-sm">Aucun message</p>
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => {
              if (item.type === "separator") {
                return (
                  <div
                    key={item.key}
                    className="flex items-center gap-3 py-3"
                  >
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[11px] text-gray-400 font-medium">
                      {item.label}
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                );
              }

              const msg = item.message;
              const isOut = msg.direction === "outbound";
              const isFailed =
                msg.status === "failed" || msg.status === "undelivered";
              const isNew = !initialIdsRef.current.has(msg.id);

              return (
                <div
                  key={item.key}
                  className={`flex ${isOut ? "justify-end" : "justify-start"} ${
                    isNew ? "msg-new" : ""
                  }`}
                >
                  <div
                    className={`max-w-[70%] ${isFailed ? "opacity-50" : ""}`}
                  >
                    <div
                      className={`px-3.5 py-2 word-break ${
                        isOut
                          ? "text-white"
                          : "text-gray-900"
                      }`}
                      style={{
                        backgroundColor: isOut ? "#0a1f3f" : "#e5e5ea",
                        borderRadius: isOut
                          ? "18px 18px 4px 18px"
                          : "18px 18px 18px 4px",
                        wordBreak: "break-word",
                      }}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.body}
                      </p>
                    </div>
                    <div
                      className={`flex items-center gap-1 mt-1 text-[10px] text-gray-400 ${
                        isOut ? "justify-end" : "justify-start"
                      }`}
                    >
                      <span className="opacity-60">
                        {formatFullTime(msg.created_at)}
                      </span>
                      {isOut && (
                        <span
                          className={
                            isFailed ? "text-red-400" : "text-gray-400"
                          }
                        >
                          {statusIcon(msg.status)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
