"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

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
      <section className="appChrome">
        <h1 className="pageTitle">Import History</h1>

        <Link href="/import/upload" className="primaryButton" style={{ display: "block", marginBottom: "2rem", textAlign: "center" }}>
          + Upload Excel
        </Link>

        {imports.length === 0 ? (
          <p className="muted">No imports yet.</p>
        ) : (
          <div style={{ marginTop: "1rem" }}>
            {imports.map((imp) => (
              <Link
                key={imp.id}
                href={`/import/${imp.id}`}
                style={{
                  display: "block",
                  padding: "1rem",
                  borderBottom: "1px solid var(--border)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {imp.status.toUpperCase()}
                </p>
                <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
                  {new Date(imp.createdAt).toLocaleDateString()}
                </p>
                {imp.error && (
                  <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "red" }}>
                    {imp.error}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
