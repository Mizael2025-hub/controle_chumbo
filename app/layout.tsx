import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle de chumbo (protótipo)",
  description: "Espelho de estoque de chumbo — Dexie offline",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
