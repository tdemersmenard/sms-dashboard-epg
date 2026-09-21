import type { Metadata } from "next";
import "./globals.css";
import { BRAND } from "@/config/brand";
import LayoutWrapper from "@/components/LayoutWrapper";

export const metadata: Metadata = {
  title: `CHLORE — ${BRAND.name}`,
  description: `${BRAND.tagline} — CRM pour la gestion des clients, leads et opérations`,
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CHLORE" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0a1628" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Thème appliqué avant le premier paint (pas de flash) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("chlore-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="antialiased">
        <LayoutWrapper>{children}</LayoutWrapper>
      </body>
    </html>
  );
}
