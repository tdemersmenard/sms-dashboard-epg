export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { prompt, message } = await req.json();
  if (!prompt || !message) {
    return NextResponse.json({ error: "prompt et message requis" }, { status: 400 });
  }

  try {
    const now = new Date();
    const dateStr = now.toLocaleDateString("fr-CA", {
      timeZone: "America/Montreal",
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("fr-CA", {
      timeZone: "America/Montreal", hour: "2-digit", minute: "2-digit",
    });

    const testContext = `

[MODE TEST — APERÇU DU PROMPT]
DATE ET HEURE ACTUELLES: ${dateStr}, ${timeStr}
Ceci est un test de prévisualisation. Aucun contexte client réel n'est injecté.
Réponds normalement à la question du client comme si c'était une vraie conversation.
`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: prompt + testContext,
      messages: [{ role: "user", content: message }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    // Strip action tags from test response for readability
    const clean = text.replace(/__ACTION:[A-Z_]+:.+?__/g, "").trim();

    return NextResponse.json({ response: clean });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
