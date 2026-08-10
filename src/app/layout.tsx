import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackSight AI — see your screenshot through a hacker's eyes",
  description:
    "HackSight AI is a local-first security checkpoint that scans screenshots for exposed secrets before you share them. OCR and secret detection run entirely in your browser — only anonymized metadata is ever sent out.",
  applicationName: "HackSight AI",
  keywords: ["security", "secret scanner", "screenshot", "OCR", "privacy", "OWASP", "credential leak"],
  openGraph: {
    title: "HackSight AI",
    description: "See your screenshot through a hacker's eyes — before you share it.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "HackSight AI",
    description: "See your screenshot through a hacker's eyes — before you share it.",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
