import { google } from "googleapis";

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export async function getAuthedGmail() {
  const oauth2Client = getOAuth2Client();

  // Get stored tokens from Supabase
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "google_tokens")
    .single();

  if (!data?.value) {
    throw new Error("Google not connected. Go to /settings to connect Gmail.");
  }

  const tokens = JSON.parse(data.value);
  oauth2Client.setCredentials(tokens);

  // Auto-refresh if expired
  oauth2Client.on("tokens", async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await supabase
      .from("settings")
      .upsert({ key: "google_tokens", value: JSON.stringify(merged) });
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}
