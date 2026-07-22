"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/client-api";

interface ImportRow {
  id: string;
  rawData: {
    fileName?: string;
    sheetName?: string;
    label?: string;
    approximateDate?: string;
    amountDisplay?: number;
  };
  mapped?: {
    entryKind?: string;
    transactionDate?: string;
    categoryName?: string;
    incomeSourceName?: string;
  };
  error?: string;
}

interface Import {
  id: string;
  status: string;
  rows: ImportRow[];
}

export default function PreviewPage() {
  const { data: session } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const importId = params?.id ?? "";

  const [imp, setImp] = useState<Import | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!session?.accessToken || !importId) {
      setLoading(false);
      return;
    }

    const fetchImport = async () => {
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/v1/imports/${importId}/preview`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
            credentials: "include",
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
    if (!imp || !session?.accessToken || !importId) return;

    setConfirming(true);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/v1/imports/${importId}/confirm`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
          credentials: "include",
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
        <p className="muted">Preview rows show the month and order preserved from the legacy workbook. Exact transaction dates were not available in the source file.</p>

        {imp.rows && imp.rows.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-outline bg-surface shadow-sm">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-outline text-left text-on-surface-soft">
                  <th className="px-4 py-3 font-semibold">File</th>
                  <th className="px-4 py-3 font-semibold">Month</th>
                  <th className="px-4 py-3 font-semibold">Label</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Approx. date</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {imp.rows.map((row) => (
                  <tr key={row.id} className="border-b border-outline/70 last:border-b-0">
                    <td className="px-4 py-3 text-on-surface-soft">{row.rawData.fileName ?? "-"}</td>
                    <td className="px-4 py-3 text-on-surface-soft">{row.rawData.sheetName ?? "-"}</td>
                    <td className="px-4 py-3 font-semibold text-on-surface">{row.rawData.label ?? "-"}</td>
                    <td className="px-4 py-3 text-on-surface-soft">
                      {row.mapped?.entryKind === "income_earned" ? "Income" : "Expense"}
                    </td>
                    <td className="px-4 py-3 text-on-surface-soft">{row.rawData.approximateDate ?? row.mapped?.transactionDate ?? "-"}</td>
                    <td className="px-4 py-3 text-on-surface-soft">
                      {typeof row.rawData.amountDisplay === "number" ? row.rawData.amountDisplay.toFixed(2) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error && <p className="muted mt-4">{error}</p>}

        <div className="mt-8 flex gap-4">
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
