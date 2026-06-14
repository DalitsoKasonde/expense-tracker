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
          <p className="muted">No transactions yet. <Link href="/add" style={{ color: "var(--primary)" }}>Add one now.</Link></p>
        ) : (
          <div className="transactionList">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="transactionItem"
              >
                <div>
                  <p className="font-semibold">
                    {tx.entryKind.replace("_", " ").toUpperCase()}
                  </p>
                  <p className="muted text-sm mt-1">
                    {new Date(tx.transactionDate).toLocaleDateString()}
                  </p>
                  {tx.note && (
                    <p className="text-sm mt-1">{tx.note}</p>
                  )}
                </div>
                <p className="font-semibold text-lg">
                  {tx.entryKind === "income" || tx.entryKind === "investment_income" ? "+" : "-"}
                  {tx.currency} {(tx.amount / 100).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <Link href="/today" className="ghostButton">
            Back to Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
