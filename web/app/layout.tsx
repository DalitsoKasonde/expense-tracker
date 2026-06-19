import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { SyncStatus } from "@/components/sync-status";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inscribed",
  description: "Inscribed keeps daily money movement, imports, and portfolio structure inside a premium ledger workspace.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          <ServiceWorkerRegister />
          <SyncStatus />
          {children}
        </Providers>
      </body>
    </html>
  );
}
