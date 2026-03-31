"use client";

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────────────────────
interface ToastItem {
  id: string;
  contactName: string;
  preview: string;
  contactId: string | null;
}

interface ToastCtx {
  addToast: (t: ToastItem) => void;
}

const ToastContext = createContext<ToastCtx>({ addToast: () => {} });
export const useToast = () => useContext(ToastContext);

// ── Toast UI ──────────────────────────────────────────────────────────────────
function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const router = useRouter();

  return (
    <div
      onClick={() => { router.push("/messages"); onDismiss(); }}
      className="flex items-start gap-3 bg-white shadow-lg rounded-xl border border-gray-200 px-4 py-3 cursor-pointer hover:shadow-xl transition-shadow animate-slideIn"
      style={{ minWidth: 280, maxWidth: 360 }}
    >
      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <MessageSquare size={14} className="text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-tight">{item.contactName}</p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{item.preview}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((t: ToastItem) => {
    setToasts((prev) => {
      // Avoid duplicate (same message id)
      if (prev.some((x) => x.id === t.id)) return prev;
      return [t, ...prev].slice(0, 5); // max 5 toasts
    });
    const timer = setTimeout(() => dismiss(t.id), 5000);
    timers.current.set(t.id, timer);
  }, [dismiss]);

  // Subscribe to inbound messages on all pages
  useEffect(() => {
    const channel = supabaseBrowser
      .channel("toast-inbound-v1")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, {
        event: "INSERT",
        schema: "public",
        table: "messages",
      }, async (payload) => {
        const msg = payload.new as { id: string; contact_id: string | null; direction: string; body: string };
        if (msg.direction !== "inbound") return;

        let contactName = msg.contact_id?.slice(0, 8) ?? "Inconnu";

        if (msg.contact_id) {
          const { data } = await supabaseBrowser
            .from("contacts")
            .select("first_name, last_name, name, phone")
            .eq("id", msg.contact_id)
            .single();
          if (data) {
            const first = data.first_name && data.first_name !== "Inconnu" ? data.first_name : null;
            const last  = data.last_name  && data.last_name.trim()  !== "" ? data.last_name  : null;
            contactName = first || last
              ? [first, last].filter(Boolean).join(" ")
              : (data.name && data.name !== "Inconnu" ? data.name : data.phone ?? "Inconnu");
          }
        }

        addToast({
          id: msg.id,
          contactName,
          preview: msg.body?.slice(0, 80) ?? "",
          contactId: msg.contact_id,
        });
      })
      .subscribe();

    return () => { supabaseBrowser.removeChannel(channel); };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container — top-right, above everything */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast item={t} onDismiss={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
