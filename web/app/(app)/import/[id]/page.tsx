"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Import {
  id: string;
  status: string;
  error?: string;
  createdAt: string;
}

export default function ImportDetailPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const importId = params?.id ?? "";

  const [imp, setImp] = useState<Import | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    if (!session?.accessToken || !importId) {
      setLoading(false);
      return;
    }

    const fetchImport = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/imports/${importId}`,
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
        setError(err instanceof Error ? err.message : "Failed to load import");
      } finally {
        setLoading(false);
      }
    };

    fetchImport();
  }, [importId, session?.accessToken]);

  const handleUndo = async () => {
    if (!imp || !session?.accessToken || !importId) return;

    setUndoing(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/imports/${importId}/undo`,
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
        setError("Failed to undo import");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo failed");
    } finally {
      setUndoing(false);
    }
  };

  if (loading) return <div className="shell">Loading...</div>;
  if (!imp) return <div className="shell">Import not found</div>;

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Import Details</h1>

        <div className="card">
          <p className="muted">Status</p>
          <h2 className="text-2xl font-bold my-2">
            {imp.status.toUpperCase()}
          </h2>
          <p className="muted">
            {new Date(imp.createdAt).toLocaleString()}
          </p>
        </div>

        {imp.error && (
          <p className="muted mt-4">
            Error: {imp.error}
          </p>
        )}

        {error && <p className="muted mt-4">{error}</p>}

        <div className="mt-8 flex gap-4">
          {imp.status === "uploaded" && (
            <Link href={`/import/${importId}/preview`} className="primaryButton">
              View Preview
            </Link>
          )}
          {imp.status === "confirmed" && (
            <button
              className="primaryButton dangerButton"
              onClick={handleUndo}
              disabled={undoing}
            >
              {undoing ? "Undoing..." : "Undo Import"}
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
