import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hrvatski izborni model",
  description: "Interaktivni model hrvatskih parlamentarnih izbora koji ankete i koalicijske scenarije pretvara u mandate po izbornim jedinicama.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
