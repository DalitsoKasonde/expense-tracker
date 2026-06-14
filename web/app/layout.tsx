import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { SyncStatus } from "@/components/sync-status";
import "./globals.css";

export const metadata: Metadata = {
  title: "Expense Tracker",
  description: "Mobile-first expense tracking with account balances, imports, and investment visibility.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ServiceWorkerRegister />
          <SyncStatus />
          {children}
        </Providers>
      </body>
    </html>
  );
}
