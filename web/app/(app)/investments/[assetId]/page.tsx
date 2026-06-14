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
  const params = useParams<{ assetId: string }>();
  const assetId = params?.assetId ?? "";

  const [lots, setLots] = useState<AssetLot[]>([]);
  const [holding, setHolding] = useState<{ quantity: number; totalCost: number; avgCostBasis: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken || !assetId) {
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
          <div className="card">
            <p className="muted">Holdings</p>
            <h2 className="text-2xl font-bold my-2">
              {holding.quantity.toFixed(2)} units
            </h2>
            <p className="muted">
              Avg cost: ZMW {(holding.avgCostBasis / 100).toFixed(2)}
            </p>
          </div>
        )}

        <div className="mt-8">
          <p className="font-semibold mb-4">Purchase History</p>
          {lots.length === 0 ? (
            <p className="muted">No lots recorded yet.</p>
          ) : (
            <div className="transactionList">
              {lots.map((lot) => (
                <div
                  key={lot.id}
                  className="transactionItem"
                >
                  <div>
                    <p className="font-semibold">
                      {lot.quantity.toFixed(2)} @ ZMW {(lot.unitPrice / 100).toFixed(2)}
                    </p>
                    <p className="muted text-sm mt-1">
                      {new Date(lot.acquisitionDate).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-sm">
                    Total: ZMW {(lot.totalCost / 100).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <Link href="/investments" className="ghostButton">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
