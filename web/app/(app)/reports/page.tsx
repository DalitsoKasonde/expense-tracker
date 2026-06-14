"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function ReportsPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    const fetchReports = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/dashboard/summary`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
          }
        );

        if (response.ok) {
          const json = await response.json();
          setData(json);
        }
      } catch (err) {
        console.error("Failed to fetch reports", err);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [session?.accessToken]);

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Reports</h1>

        {data && (
          <>
            <div className="card">
              <p className="muted">This Month</p>
              <h2 className="text-3xl font-bold my-2">
                ZMW {(data.netCashFlow / 100).toFixed(2)}
              </h2>
              <p className="muted">Net Cash Flow</p>
            </div>

            <div className="statsGrid">
              <div className="statCard">
                <p className="muted">Income</p>
                <strong>ZMW {(data.income / 100).toFixed(2)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Expense</p>
                <strong>ZMW {(data.expense / 100).toFixed(2)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Saving</p>
                <strong>ZMW {(data.saving / 100).toFixed(2)}</strong>
              </div>
              <div className="statCard">
                <p className="muted">Investment</p>
                <strong>ZMW {(data.investment / 100).toFixed(2)}</strong>
              </div>
            </div>

            {data.netCashFlow > 0 && (
              <p className="muted mt-4 text-center">
                ✓ Positive cash flow this month
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
