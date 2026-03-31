"use client";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";
import ConversationList from "@/components/Messages/ConversationList";
import MessageThread from "@/components/Messages/MessageThread";
import MessageInput from "@/components/Messages/MessageInput";
import type { MessageTemplate } from "@/lib/types";

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

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

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

  const activeConversation = conversations.find(
    (c) => c.contact_id === activeContactId
  );
  const activeMessages = activeContactId ? (messages[activeContactId] ?? []) : [];

  return (
    <div className="flex h-full bg-white">
      {/* Conversation list — 320px */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col">
        <ConversationList
          conversations={conversations}
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
