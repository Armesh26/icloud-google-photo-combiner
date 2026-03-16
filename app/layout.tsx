import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import NavBar from "@/components/nav-bar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "PhotoFuse — Combine Albums Into One Gallery",
  description:
    "Aggregate photos from Google Photos and iCloud shared albums into a single unified gallery.",
  referrer: "no-referrer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} font-sans antialiased`}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
