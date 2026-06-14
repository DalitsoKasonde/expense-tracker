"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Transaction {
  id: string;
  transactionDate: string;
  entryKind: string;
  amount: number;
  currency: string;
  note?: string;
}

export default function TransactionsPage() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    const fetchTransactions = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/transactions?limit=50`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
          }
        );

        if (response.ok) {
          const json = await response.json();
          setTransactions(json || []);
        }
      } catch (err) {
        console.error("Failed to fetch transactions", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [session?.accessToken]);

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">All Transactions</h1>

        {transactions.length === 0 ? (
          <p className="muted">No transactions yet. <Link href="/add">Add one now.</Link></p>
        ) : (
          <div style={{ marginTop: "1rem" }}>
            {transactions.map((tx) => (
              <div
                key={tx.id}
                style={{
                  padding: "1rem",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    {tx.entryKind.replace("_", " ").toUpperCase()}
                  </p>
                  <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
                    {new Date(tx.transactionDate).toLocaleDateString()}
                  </p>
                  {tx.note && (
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem" }}>{tx.note}</p>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>
                  {tx.entryKind === "income" || tx.entryKind === "investment_income" ? "+" : "-"}
                  {tx.currency} {(tx.amount / 100).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: "2rem" }}>
          <Link href="/today" className="ghostButton">
            Back to Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
