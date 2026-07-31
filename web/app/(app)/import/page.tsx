"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PageHeader,
  PageShell,
} from "@/components/ui";
import { getApiBaseUrl } from "@/lib/client-api";

interface Import {
  id: string;
  fileName?: string;
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
          `${getApiBaseUrl()}/v1/imports`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
            credentials: "include",
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

  if (loading) return <div className="page-shell">Loading...</div>;

  return (
    <PageShell>
      <section className="workspaceStack">
        <PageHeader
          eyebrow="Imports"
          title="Import history"
          subtitle="Review uploaded workbooks, confirm prepared transactions, or undo an import."
        />

        <Link href="/import/new" className="btn btn-primary btn-block">
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
                    {imp.fileName || "Workbook import"}
                  </p>
                  <p className="muted text-sm mt-1">
                    {imp.status.replace(/_/g, " ").toUpperCase()} ·{" "}
                    {new Date(imp.createdAt).toLocaleDateString()}
                  </p>
                  {imp.error && (
                    <p className="text-sm mt-1 text-negative" role="alert">
                      {imp.error}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  );
}
