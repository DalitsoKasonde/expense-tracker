"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/accounts`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
          }
        );

        if (response.ok) {
          const accounts = await response.json();
          if (accounts && accounts.length > 0) {
            router.push("/today");
          }
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
        { name: "Cash", currency: "ZMW" },
        { name: "Mobile Money", currency: "ZMW" },
        { name: "Bank", currency: "ZMW" },
      ];

      for (const account of defaults) {
        await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/accounts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.accessToken}`,
            },
            body: JSON.stringify(account),
          }
        );
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
      <section className="appChrome">
        <h1 className="pageTitle">Welcome!</h1>
        <p className="lede">Let's set up your expense tracker. We'll create three default accounts:</p>
        
        <div className="pillList" style={{ marginTop: "1rem" }}>
          <span className="pill">Cash</span>
          <span className="pill">Mobile Money</span>
          <span className="pill">Bank</span>
        </div>

        {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}

        <button
          className="primaryButton"
          style={{ width: "100%", marginTop: "2rem" }}
          onClick={handleCreateDefaults}
          disabled={loading}
        >
          {loading ? "Creating..." : "Get Started"}
        </button>
      </section>
    </main>
  );
}
