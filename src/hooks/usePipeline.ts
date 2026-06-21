"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFranchise } from "@/components/FranchiseProvider";
import type { Contact } from "@/lib/types";

export const STAGES = [
  "nouveau",
  "contacté",
  "soumission envoyée",
  "closé",
  "planifié",
  "complété",
  "perdu",
] as const;

export type Stage = (typeof STAGES)[number];

export function usePipeline() {
  const { franchiseId } = useFranchise();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const loadContacts = useCallback(async () => {
    if (!franchiseId) return;
    const { data, error } = await supabaseBrowser
      .from("contacts")
      .select("*")
      .eq("franchise_id", franchiseId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("usePipeline loadContacts:", error);
      return;
    }
    setContacts((data ?? []) as Contact[]);
    setLoading(false);
  }, [franchiseId]);

  // Initial load
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Realtime subscription on contacts
  useEffect(() => {
    const channel = supabaseBrowser
      .channel("pipeline-contacts-rt")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "contacts" }, () => {
        loadContacts();
      })
      .subscribe();
    return () => { supabaseBrowser.removeChannel(channel); };
  }, [loadContacts, franchiseId]);

  const updateStage = useCallback(async (contactId: string, newStage: string) => {
    // Optimistic update
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, stage: newStage } : c))
    );

    if (newStage === "closé") {
      // Use API route so portal access is created automatically
      const res = await fetch("/api/contacts/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, stage: newStage }),
      });
      if (!res.ok) {
        console.error("usePipeline updateStage (closé):", await res.text());
        loadContacts();
      }
    } else {
      const { error } = await supabaseBrowser
        .from("contacts")
        .update({ stage: newStage })
        .eq("id", contactId)
        .eq("franchise_id", franchiseId);
      if (error) {
        console.error("usePipeline updateStage:", error);
        // Rollback
        loadContacts();
      }
    }
  }, [loadContacts]);

  const createContact = useCallback(async (fields: Partial<Contact>) => {
    const { data, error } = await supabaseBrowser
      .from("contacts")
      .insert({ stage: "nouveau", franchise_id: franchiseId, ...fields })
      .select()
      .single();
    if (error) throw error;
    setContacts((prev) => [data as Contact, ...prev]);
    return data as Contact;
  }, []);

  // Group contacts by stage
  const byStage = STAGES.reduce<Record<string, Contact[]>>((acc, s) => {
    acc[s] = contacts.filter((c) => (c.stage ?? "nouveau") === s);
    return acc;
  }, {} as Record<string, Contact[]>);

  return { contacts, byStage, loading, updateStage, createContact };
}
