import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "CHLORE — Entretien Piscine Granby",
  description: "CRM pour la gestion des clients, leads et opérations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="antialiased">
        <Sidebar />
        <main
          style={{ marginLeft: 260 }}
          className="min-h-screen bg-gray-50"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
