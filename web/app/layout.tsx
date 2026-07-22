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
    default: "Chuma",
    template: "%s | Chuma",
  },
  description: "Chuma brings accounts, daily money movement, goals, and investments into one calm financial workspace.",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Chuma — Your money, made clear.",
    description: "Track accounts, everyday money activity, stocks, and government bonds in one clear workspace.",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Chuma personal finance workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chuma — Your money, made clear.",
    description: "Track accounts, everyday money activity, stocks, and government bonds in one clear workspace.",
    images: ["/og.png"],
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
