"use client";

import { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { Conversation } from "@/lib/types";
import {
  formatPhone,
  formatConvTime,
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface Props {
  conversations: Conversation[];
  activeContactId: string | null;
  onSelect: (contactId: string) => void;
  loading: boolean;
}

export default function ConversationList({
  conversations,
  activeContactId,
  onSelect,
  loading,
}: Props) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const filtered = conversations.filter((c) => {
    if (!debouncedQuery) return true;
    const q = debouncedQuery.toLowerCase();
    const name = displayName(c).toLowerCase();
    return (
      name.includes(q) ||
      c.phone.includes(q) ||
      (c.last_message ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col h-full bg-sur">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 border-b border-line">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-mut"
          />
          <input
            type="text"
            placeholder="Rechercher..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input-glow w-full bg-chip rounded-full pl-9 pr-4 py-2 text-sm text-ink placeholder:text-mut focus:outline-none transition"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-line border-t-acc rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-mut text-sm text-center py-16">
            {debouncedQuery ? "Aucun résultat" : "Aucune conversation"}
          </p>
        ) : (
          filtered.map((conv) => {
            const isActive = conv.contact_id === activeContactId;
            const name = displayName(conv);
            const initials = getInitials(conv);
            const avatarBg = getAvatarColor(conv.contact_id);
            const hasUnread = conv.unread_count > 0;

            return (
              <button
                key={conv.contact_id}
                onClick={() => onSelect(conv.contact_id)}
                className={`conversation-item w-full text-left px-3 py-3 flex items-center gap-3 ${
                  isActive ? "active" : ""
                }`}
              >
                {/* Avatar */}
                <div
                  className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold text-white select-none"
                  style={{ backgroundColor: avatarBg }}
                >
                  {initials}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={`text-sm truncate ${
                        hasUnread
                          ? "font-semibold text-ink"
                          : "font-medium text-ink"
                      }`}
                    >
                      {name}
                    </span>
                    <span className="num text-[11px] text-mut flex-shrink-0 ml-2">
                      {conv.last_message_at
                        ? formatConvTime(conv.last_message_at)
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 min-w-0 text-xs text-mut truncate leading-snug">
                      {conv.last_direction === "outbound" && (
                        <span className="text-mut">Toi: </span>
                      )}
                      {conv.last_message ?? ""}
                    </p>
                    {hasUnread && (
                      <span className="num flex-shrink-0 min-w-[20px] h-5 rounded-full bg-acc text-accink text-[11px] font-semibold flex items-center justify-center px-1.5">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
