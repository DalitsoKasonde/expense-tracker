"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Settings</h1>

        <div className="surfaceCard" style={{ marginBottom: "1rem" }}>
          <p className="muted">Logged in as</p>
          <p style={{ margin: "0.5rem 0 0 0", fontWeight: 600 }}>
            {session?.user?.email}
          </p>
        </div>

        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem", margin: "1rem 0 1rem 0" }}>Preferences</h2>

          <div className="surfaceCard" style={{ marginBottom: "1rem" }}>
            <p style={{ margin: 0 }}>
              <strong>Currency</strong>
            </p>
            <p className="muted" style={{ margin: "0.5rem 0 0 0" }}>
              ZMW (Zambian Kwacha)
            </p>
          </div>

          <div className="surfaceCard" style={{ marginBottom: "1rem" }}>
            <p style={{ margin: 0 }}>
              <strong>Theme</strong>
            </p>
            <p className="muted" style={{ margin: "0.5rem 0 0 0" }}>
              Light (system default)
            </p>
          </div>

          <div className="surfaceCard" style={{ marginBottom: "1rem" }}>
            <p style={{ margin: 0 }}>
              <strong>Notifications</strong>
            </p>
            <p className="muted" style={{ margin: "0.5rem 0 0 0" }}>
              Disabled
            </p>
          </div>
        </div>

        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1.2rem", margin: "1rem 0 1rem 0" }}>Data</h2>

          <button
            className="primaryButton"
            style={{ width: "100%", backgroundColor: "#10b981" }}
            onClick={() => alert("Export coming soon")}
          >
            Export Data
          </button>
        </div>

        <div style={{ marginBottom: "2rem" }}>
          <button
            className="primaryButton"
            style={{ width: "100%", backgroundColor: "#ef4444" }}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign Out
          </button>
        </div>

        <p className="muted" style={{ fontSize: "0.85rem", textAlign: "center" }}>
          Expense Tracker • Phase 1-5 MVP
        </p>
      </section>
    </main>
  );
}
