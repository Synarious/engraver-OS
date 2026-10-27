import type { Metadata } from "next";
import "./globals.css"; // Global styles

export const metadata: Metadata = {
  title: "Engraver — Music Library & Notation",
  description:
    "Local music library, notation editor, practice tools, and performance reader.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Engraver", statusBarStyle: "default" },
  openGraph: {
    title: "Hybrid Notation Editor",
    description:
      "A web-based Guitar Pro / Sibelius hybrid notation editor using alphaTab and Verovio.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hybrid Notation Editor",
    description:
      "A web-based Guitar Pro / Sibelius hybrid notation editor using alphaTab and Verovio.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
