import { supabaseBrowser } from "@/lib/supabase-browser";

// Re-export all shared types/constants (components importent depuis ici)
export * from "@/lib/depenses-config";
import type { Depense } from "@/lib/depenses-config";

// ── Supabase CRUD ─────────────────────────────────────────────────

export async function fetchDepenses(annee: number): Promise<Depense[]> {
  const { data, error } = await supabaseBrowser
    .from("depenses")
    .select("*")
    .eq("annee", annee)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as Depense[]) || [];
}

export async function deleteDepense(id: string, recuUrl: string | null): Promise<void> {
  if (recuUrl) {
    try {
      const url = new URL(recuUrl);
      const marker = "/storage/v1/object/public/recus/";
      const idx = url.pathname.indexOf(marker);
      if (idx !== -1) {
        const filePath = url.pathname.slice(idx + marker.length);
        await supabaseBrowser.storage.from("recus").remove([filePath]);
      }
    } catch {
      // Ignore storage errors silently
    }
  }
  const { error } = await supabaseBrowser.from("depenses").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadRecu(
  file: File,
  annee: number,
  depenseId: string
): Promise<{ url: string; nom: string }> {
  const ext = file.name.split(".").pop() || "bin";
  const timestamp = Date.now();
  const path = `${annee}/${depenseId}-${timestamp}.${ext}`;

  const { error } = await supabaseBrowser.storage
    .from("recus")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw error;

  const { data: urlData } = supabaseBrowser.storage
    .from("recus")
    .getPublicUrl(path);

  return { url: urlData.publicUrl, nom: file.name };
}
