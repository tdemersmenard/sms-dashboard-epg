export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: "Image requise" }, { status: 400 });

    const mediaType = imageBase64.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: cleanBase64 },
          },
          {
            type: "text",
            text: `Cette photo montre un odomètre de voiture. Lis le nombre exact affiché (kilométrage total). Réponds UNIQUEMENT en JSON valide:
{
  "km": number,
  "confidence": "high" | "medium" | "low"
}

Si tu ne peux pas lire le nombre clairement, mets confidence à "low".`,
          },
        ],
      }],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (response.content[0] as any).text || "";
    const cleanText = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanText);

    return NextResponse.json({ success: true, ...parsed });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
