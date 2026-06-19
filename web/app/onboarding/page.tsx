"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiCallWithToken } from "@/lib/client-api";
import { AppPageHeader } from "@/components/app-page-header";
import { AddIcon } from "@/components/nav-icons";

interface Account {
  id: string;
}

export default function OnboardingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;

    const checkAccounts = async () => {
      try {
        const accounts = await apiCallWithToken<Account[]>(session.accessToken, "/v1/accounts");
        if (accounts && accounts.length > 0) {
          router.push("/today");
        }
      } catch (err) {
        console.error("Failed to check accounts", err);
      }
    };

    checkAccounts();
  }, [session?.accessToken, router]);

  const handleCreateDefaults = async () => {
    if (!session?.accessToken) {
      setError("Not authenticated");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const defaults = [
        { name: "Cash", accountType: "cash", currency: "ZMW" },
        { name: "Mobile Money", accountType: "mobile_money", currency: "ZMW" },
        { name: "Bank", accountType: "bank", currency: "ZMW" },
      ];

      for (const account of defaults) {
        await apiCallWithToken(session.accessToken, "/v1/accounts", {
          method: "POST",
          body: account,
        });
      }

      setDone(true);
      setTimeout(() => router.push("/today"), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create accounts");
    } finally {
      setLoading(false);
    }
  };

  if (!session) return <div className="shell">Loading...</div>;
  if (done) return <div className="shell"><section className="appChrome"><p>Setting up... redirecting to dashboard</p></section></div>;

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <AppPageHeader
          eyebrow="Inscribed setup"
          title="Welcome"
          accent="Begin with a few calm defaults"
          lead="We will create three starter accounts so the ledger can begin receiving entries immediately."
          icon={AddIcon}
        />
        <p className="lede">We&apos;ll create these default accounts for the first session:</p>
        
        <div className="pillList">
          <span className="pill">Cash</span>
          <span className="pill">Mobile Money</span>
          <span className="pill">Bank</span>
        </div>

        {error && <p className="muted mt-4">{error}</p>}

        <button
          className="primaryButton w-full mt-8"
          onClick={handleCreateDefaults}
          disabled={loading}
        >
          {loading ? "Creating..." : "Get Started"}
        </button>
      </section>
    </main>
  );
}
