"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";
import ConversationList from "@/components/Messages/ConversationList";
import MessageThread from "@/components/Messages/MessageThread";
import MessageInput from "@/components/Messages/MessageInput";
import type { Conversation, MessageTemplate } from "@/lib/types";

// Reads ?contact= param and opens/creates the conversation
function ContactParamHandler({
  conversations,
  loadingConversations,
  setActiveContactId,
  injectConversation,
}: {
  conversations: Conversation[];
  loadingConversations: boolean;
  setActiveContactId: (id: string) => void;
  injectConversation: (c: Conversation) => void;
}) {
  const searchParams = useSearchParams();
  const contactParam = searchParams.get("contact");

  useEffect(() => {
    if (!contactParam || loadingConversations) return;

    // If conversation already exists, just open it
    const existing = conversations.find((c) => c.contact_id === contactParam);
    if (existing) {
      setActiveContactId(contactParam);
      return;
    }

    // New contact — fetch info and inject a synthetic conversation
    supabase
      .from("contacts")
      .select("id, first_name, last_name, name, phone, stage, notes")
      .eq("id", contactParam)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const synthetic: Conversation = {
          contact_id: data.id,
          phone: data.phone ?? "",
          name: data.name ?? null,
          first_name: data.first_name ?? null,
          last_name: data.last_name ?? null,
          stage: data.stage ?? null,
          notes: data.notes ?? null,
          last_message: "",
          last_direction: "outbound",
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        };
        injectConversation(synthetic);
        setActiveContactId(contactParam);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactParam, loadingConversations]);

  return null;
}

export default function MessagesPage() {
  const {
    conversations,
    messages,
    activeContactId,
    setActiveContactId,
    loadMessages,
    sendMessage,
    markAsRead,
    loadingConversations,
    loadingMessages,
  } = useRealtimeMessages();

  const [extraConversations, setExtraConversations] = useState<Conversation[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

  // Merge injected synthetic conversations with real ones
  const allConversations = [
    ...conversations,
    ...extraConversations.filter(
      (e) => !conversations.some((c) => c.contact_id === e.contact_id)
    ),
  ];

  const injectConversation = useCallback((c: Conversation) => {
    setExtraConversations((prev) =>
      prev.some((e) => e.contact_id === c.contact_id) ? prev : [c, ...prev]
    );
  }, []);

  // Load SMS templates once
  useEffect(() => {
    supabase
      .from("message_templates")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (data) setTemplates(data as MessageTemplate[]);
      });
  }, []);

  // When active conversation changes, load its messages and mark as read
  useEffect(() => {
    if (!activeContactId) return;
    loadMessages(activeContactId);
    markAsRead(activeContactId);
  }, [activeContactId, loadMessages, markAsRead]);

  // Once a synthetic conversation gets a real message, remove it from extras
  useEffect(() => {
    if (extraConversations.length === 0) return;
    setExtraConversations((prev) =>
      prev.filter((e) => !conversations.some((c) => c.contact_id === e.contact_id))
    );
  }, [conversations, extraConversations.length]);

  const handleSelectConversation = useCallback(
    (contactId: string) => {
      setActiveContactId(contactId);
    },
    [setActiveContactId]
  );

  const handleSend = useCallback(
    async (body: string) => {
      if (!activeContactId) return;
      await sendMessage(activeContactId, body);
    },
    [activeContactId, sendMessage]
  );

  const activeConversation = allConversations.find(
    (c) => c.contact_id === activeContactId
  );
  const activeMessages = activeContactId ? (messages[activeContactId] ?? []) : [];

  return (
    <div className="flex h-full bg-white">
      <Suspense fallback={null}>
        <ContactParamHandler
          conversations={allConversations}
          loadingConversations={loadingConversations}
          setActiveContactId={setActiveContactId}
          injectConversation={injectConversation}
        />
      </Suspense>

      {/* Conversation list — 320px */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col">
        <ConversationList
          conversations={allConversations}
          activeContactId={activeContactId}
          onSelect={handleSelectConversation}
          loading={loadingConversations}
        />
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {!activeConversation ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <MessageSquare size={24} className="text-gray-300" />
              </div>
              <p className="text-gray-400 text-sm">
                Sélectionne une conversation
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0">
              <MessageThread
                conversation={activeConversation}
                messages={activeMessages}
                loading={loadingMessages}
              />
            </div>
            <MessageInput
              onSend={handleSend}
              templates={templates}
              autoFocus={true}
            />
          </>
        )}
      </div>
    </div>
  );
}
