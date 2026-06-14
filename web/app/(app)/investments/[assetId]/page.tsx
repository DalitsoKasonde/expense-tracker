"use client";

import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface AssetLot {
  id: string;
  quantity: number;
  unitPrice: number;
  fees: number;
  totalCost: number;
  acquisitionDate: string;
}

export default function AssetDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const assetId = params.assetId as string;

  const [lots, setLots] = useState<AssetLot[]>([]);
  const [holding, setHolding] = useState<{ quantity: number; totalCost: number; avgCostBasis: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    const fetchHolding = async () => {
      try {
        // In a real app, you'd fetch the specific asset's lots
        // For now, just show placeholder
        setHolding({
          quantity: 10,
          totalCost: 50000,
          avgCostBasis: 5000,
        });
      } catch (err) {
        console.error("Failed to fetch holding", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHolding();
  }, [assetId, session?.accessToken]);

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Asset Details</h1>

        {holding && (
          <div className="heroCard">
            <p className="muted">Holdings</p>
            <h2 style={{ fontSize: "1.5rem", margin: "0.5rem 0" }}>
              {holding.quantity.toFixed(2)} units
            </h2>
            <p className="muted">
              Avg cost: ZMW {(holding.avgCostBasis / 100).toFixed(2)}
            </p>
          </div>
        )}

        <div style={{ marginTop: "2rem" }}>
          <p style={{ fontWeight: 600, marginBottom: "1rem" }}>Purchase History</p>
          {lots.length === 0 ? (
            <p className="muted">No lots recorded yet.</p>
          ) : (
            lots.map((lot) => (
              <div
                key={lot.id}
                style={{
                  padding: "1rem",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {lot.quantity.toFixed(2)} @ ZMW {(lot.unitPrice / 100).toFixed(2)}
                </p>
                <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
                  {new Date(lot.acquisitionDate).toLocaleDateString()}
                </p>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
                  Total: ZMW {(lot.totalCost / 100).toFixed(2)}
                </p>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: "2rem" }}>
          <Link href="/investments" className="ghostButton">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
