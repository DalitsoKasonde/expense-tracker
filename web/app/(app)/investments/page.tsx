"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Holding {
  assetId: string;
  quantity: number;
  totalCost: number;
  avgCostBasis: number;
}

export default function InvestmentsPage() {
  const { data: session } = useSession();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    const fetchHoldings = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/investments/holdings`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
          }
        );

        if (response.ok) {
          const json = await response.json();
          setHoldings(json || []);
        }
      } catch (err) {
        console.error("Failed to fetch holdings", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHoldings();
  }, [session?.accessToken]);

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Investments</h1>

        <Link href="/investments/add" className="primaryButton" style={{ display: "block", marginBottom: "2rem", textAlign: "center" }}>
          + Add Investment
        </Link>

        {holdings.length === 0 ? (
          <p className="muted">No holdings yet.</p>
        ) : (
          <div style={{ marginTop: "1rem" }}>
            {holdings.map((h) => (
              <Link
                key={h.assetId}
                href={`/investments/${h.assetId}`}
                style={{
                  display: "block",
                  padding: "1rem",
                  borderBottom: "1px solid var(--border)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>
                      {h.quantity.toFixed(2)} units
                    </p>
                    <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
                      Avg cost: ZMW {(h.avgCostBasis / 100).toFixed(2)}
                    </p>
                  </div>
                  <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
                    ZMW {(h.totalCost / 100).toFixed(2)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
