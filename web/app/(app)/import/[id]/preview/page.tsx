"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface ImportRow {
  id: string;
  rawData: Record<string, unknown>;
  mapped?: Record<string, unknown>;
  error?: string;
}

interface Import {
  id: string;
  status: string;
  rows: ImportRow[];
}

export default function PreviewPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const importId = params.id as string;

  const [imp, setImp] = useState<Import | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    const fetchImport = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/imports/${importId}/preview`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
          }
        );

        if (response.ok) {
          const json = await response.json();
          setImp(json);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load preview");
      } finally {
        setLoading(false);
      }
    };

    fetchImport();
  }, [importId, session?.accessToken]);

  const handleConfirm = async () => {
    if (!imp || !session?.accessToken) return;

    setConfirming(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/imports/${importId}/confirm`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        }
      );

      if (response.ok) {
        router.push("/import");
      } else {
        setError("Failed to confirm import");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <div className="shell">Loading...</div>;
  if (!imp) return <div className="shell">Import not found</div>;

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Preview Import</h1>

        <p className="muted">Status: {imp.status}</p>

        {imp.rows && imp.rows.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <p style={{ fontWeight: 600 }}>First 10 rows:</p>
            {imp.rows.map((row) => (
              <div
                key={row.id}
                style={{
                  padding: "0.75rem",
                  borderBottom: "1px solid var(--border)",
                  fontSize: "0.9rem",
                }}
              >
                <p style={{ margin: 0 }}>
                  {JSON.stringify(row.rawData).substring(0, 100)}...
                </p>
                {row.error && (
                  <p style={{ margin: "0.25rem 0 0 0", color: "red" }}>
                    Error: {row.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p style={{ color: "red", marginTop: "1rem" }}>{error}</p>}

        <div style={{ marginTop: "2rem", display: "flex", gap: "1rem" }}>
          {imp.status === "ready_to_confirm" && (
            <button
              className="primaryButton"
              onClick={handleConfirm}
              disabled={confirming}
            >
              {confirming ? "Confirming..." : "Confirm Import"}
            </button>
          )}
          <Link href="/import" className="ghostButton">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
