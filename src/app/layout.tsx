import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMS Dashboard — Entretien Piscine Granby",
  description: "Gestion des conversations SMS avec tes leads piscine",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
