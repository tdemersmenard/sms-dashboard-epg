export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOAuth2Client } from "@/lib/google";

export async function GET() {
  const oauth2Client = getOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
  });

  return NextResponse.redirect(authUrl);
}
