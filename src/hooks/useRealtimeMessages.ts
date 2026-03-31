"use client";

import { useEffect } from "react";

export function useRealtimeMessages(onNewMessage: () => void) {
  useEffect(() => {
    // TODO: subscribe to Supabase Realtime messages
    return () => {};
  }, [onNewMessage]);
}
