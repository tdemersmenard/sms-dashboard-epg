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
  const first = conv.first_name;
  const last = conv.last_name;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  return conv.name ?? formatPhone(conv.phone);
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
    <div className="flex flex-col h-full bg-white">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Rechercher..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-gray-100 rounded-full pl-9 pr-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-16">
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
                className={`w-full text-left px-3 py-3 flex items-center gap-3 transition-colors duration-150 ${
                  isActive
                    ? "bg-blue-50"
                    : "hover:bg-gray-50"
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
                          ? "font-semibold text-gray-900"
                          : "font-medium text-gray-700"
                      }`}
                    >
                      {name}
                    </span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 ml-2">
                      {conv.last_message_at
                        ? formatConvTime(conv.last_message_at)
                        : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400 truncate leading-snug">
                      {conv.last_direction === "outbound" && (
                        <span className="text-gray-500">Toi: </span>
                      )}
                      {conv.last_message ?? ""}
                    </p>
                    {hasUnread && (
                      <span className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-blue-500 text-white text-[11px] font-semibold flex items-center justify-center px-1.5">
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
