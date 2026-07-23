import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Quicksand } from "next/font/google";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { SyncStatus } from "@/components/sync-status";
import "./globals.css";

const quicksand = Quicksand({
  subsets: ["latin"],
  variable: "--font-quicksand",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL?.trim() || "http://localhost:3000"),
  title: {
    default: "Expenses",
    template: "%s | Expenses",
  },
  description: "Expenses brings accounts, daily money movement, goals, and investments into one calm financial workspace.",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Expenses — Your money, made clear.",
    description: "Track accounts, everyday money activity, stocks, and government bonds in one clear workspace.",
    type: "website",
    images: [{ url: "/inscribed-logo.png", width: 2174, height: 964, alt: "Inscribed — Expenses" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Expenses — Your money, made clear.",
    description: "Track accounts, everyday money activity, stocks, and government bonds in one clear workspace.",
    images: ["/inscribed-logo.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={quicksand.variable} suppressHydrationWarning>
        <Providers>
          <ServiceWorkerRegister />
          <SyncStatus />
          {children}
        </Providers>
      </body>
    </html>
  );
}
