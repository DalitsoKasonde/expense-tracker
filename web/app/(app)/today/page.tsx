"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardData {
  income: number;
  expense: number;
  saving: number;
  investment: number;
  netCashFlow: number;
}

export default function TodayPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    const fetchDashboard = async () => {
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
        console.error("Failed to fetch dashboard", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [session?.accessToken]);

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Today</h1>

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
          </>
        )}

        <div className="flex gap-4 mt-8">
          <Link href="/add" className="primaryButton">
            + Add Entry
          </Link>
          <Link href="/transactions" className="ghostButton">
            View All
          </Link>
        </div>
      </section>
    </main>
  );
}
