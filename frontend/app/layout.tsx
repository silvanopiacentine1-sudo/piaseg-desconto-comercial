import type { Metadata, Viewport } from "next";
import { Cinzel_Decorative, Jost } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel_Decorative({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Desconto Comercial - Conta Corrente | Piaseg",
  description: "Saldo de desconto comercial nas seguradoras para os franqueados Piaseg",
};

export const viewport: Viewport = {
  themeColor: "#072a3c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${cinzel.variable} ${jost.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
