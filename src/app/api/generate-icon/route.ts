import { NextResponse } from "next/server";

export async function GET() {
  // SVG simple avec le texte "C" sur fond bleu
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="80" fill="#0a1f3f"/>
    <text x="256" y="340" font-family="Arial, sans-serif" font-size="300" font-weight="bold" fill="white" text-anchor="middle">C</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: { "Content-Type": "image/svg+xml" },
  });
}
