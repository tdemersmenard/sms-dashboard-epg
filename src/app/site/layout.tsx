import type { Metadata } from "next";
import { Montserrat, Archivo } from "next/font/google";
import MetaPixel from "@/components/site/MetaPixel";
import "./site.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display-site",
  display: "swap",
});
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body-site",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ALTAMAR — Entretien de piscine à Granby | Prix affichés",
  description:
    "Les prix sont affichés, la réponse prend 30 secondes. Entretien de piscine et spa à Granby: visite chaque semaine, produits inclus, rapport photo après chaque passage.",
  openGraph: {
    title: "ALTAMAR — Entretien de piscine à Granby",
    description: "Prix affichés. Réponse en 30 secondes, chrono en main. Granby, Bromont, Waterloo, Roxton.",
    images: ["/brand/og-image.png"],
    locale: "fr_CA",
    type: "website",
  },
  icons: { icon: "/brand/favicon-32.png", apple: "/brand/logo-mark-192.png" },
};

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "ALTAMAR",
  description: "Entretien de piscine et spa — prix affichés, réponse texto en 30 secondes.",
  telephone: "+14509159650",
  address: {
    "@type": "PostalAddress",
    streetAddress: "86 rue de Windsor",
    addressLocality: "Granby",
    addressRegion: "QC",
    addressCountry: "CA",
  },
  areaServed: ["Granby", "Bromont", "Waterloo", "Roxton Pond"],
  priceRange: "$$",
  image: "/brand/og-image.png",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`alta ${montserrat.variable} ${archivo.variable}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
      />
      <MetaPixel />
      {children}
    </div>
  );
}
