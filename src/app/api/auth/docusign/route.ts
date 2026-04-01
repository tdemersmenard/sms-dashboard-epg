import { NextResponse } from "next/server";

export async function GET() {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY!;
  const redirectUri = process.env.DOCUSIGN_REDIRECT_URI!;

  const authUrl = `https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature&client_id=${integrationKey}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.redirect(authUrl);
}
