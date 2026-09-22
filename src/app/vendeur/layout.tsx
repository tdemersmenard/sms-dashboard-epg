import { Montserrat, Archivo } from "next/font/google";
import "./vendeur.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--font-display-site", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body-site", display: "swap" });

/** Racine /vendeur — fontes + CSS. Le garde d'auth vit dans (app)/layout.tsx. */
export default function VendeurRootLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${montserrat.variable} ${archivo.variable}`}>{children}</div>;
}
