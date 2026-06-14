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

        <Link href="/investments/add" className="primaryButton block mb-8 text-center">
          + Add Investment
        </Link>

        {holdings.length === 0 ? (
          <p className="muted">No holdings yet.</p>
        ) : (
          <div className="transactionList">
            {holdings.map((h) => (
              <Link
                key={h.assetId}
                href={`/investments/${h.assetId}`}
                className="transactionItem"
              >
                <div>
                  <p className="font-semibold">
                    {h.quantity.toFixed(2)} units
                  </p>
                  <p className="muted text-sm mt-1">
                    Avg cost: ZMW {(h.avgCostBasis / 100).toFixed(2)}
                  </p>
                </div>
                <p className="font-semibold text-lg">
                  ZMW {(h.totalCost / 100).toFixed(2)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
