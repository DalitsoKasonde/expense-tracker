"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppPageHeader } from "@/components/app-page-header";
import { HistoryIcon } from "@/components/nav-icons";

interface Import {
  id: string;
  status: string;
  createdAt: string;
  error?: string;
}

export default function ImportPage() {
  const { data: session } = useSession();
  const [imports, setImports] = useState<Import[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    const fetchImports = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/imports`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
          }
        );

        if (response.ok) {
          const json = await response.json();
          setImports(json || []);
        }
      } catch (err) {
        console.error("Failed to fetch imports", err);
      } finally {
        setLoading(false);
      }
    };

    fetchImports();
  }, [session?.accessToken]);

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <AppPageHeader
          eyebrow="Inscribed imports"
          title="Import History"
          accent="Reviewed before it reaches the ledger"
          lead="Track uploaded workbooks, preview state, confirmation status, and reversals in one quieter review surface."
          icon={HistoryIcon}
        />

        <Link href="/import/new" className="primaryButton block text-center">
          Upload Excel
        </Link>

        {imports.length === 0 ? (
          <p className="muted">No imports yet.</p>
        ) : (
          <div className="transactionList">
            {imports.map((imp) => (
              <Link
                key={imp.id}
                href={`/import/${imp.id}`}
                className="transactionItem"
              >
                <div>
                  <p className="font-semibold">
                    {imp.status.toUpperCase()}
                  </p>
                  <p className="muted text-sm mt-1">
                    {new Date(imp.createdAt).toLocaleDateString()}
                  </p>
                  {imp.error && (
                    <p className="text-sm mt-1 text-red-600">
                      {imp.error}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
