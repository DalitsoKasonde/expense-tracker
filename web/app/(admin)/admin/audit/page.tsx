"use client";

import { PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { useEffect, useState } from "react";
import { type AuditLog, formatDate } from "@/components/admin/admin-data";

export default function AdminAuditPage() {
  const apiCall = useApiCall();
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void apiCall<AuditLog[]>("/v1/admin/audit")
      .then((items) => setAudit(items ?? []))
      .catch((error) => setMessage(error instanceof Error ? error.message : "The audit trail could not be loaded."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <div className="workspaceStack">
        <PageHeader
          eyebrow="System administration"
          title="Audit trail"
          subtitle="Every action taken from this console, newest first. It is written automatically and cannot be edited here."
        />

        {message ? <p className="statusText" role="status">{message}</p> : null}

        <section className="card settingsListPanel overflow-hidden">
          <div className="settingsHeaderRow">
            <div>
              <strong>Recorded actions</strong>
              <p className="muted">{loading ? "Loading…" : `${audit.length} recorded`}</p>
            </div>
          </div>

          {!loading && audit.length === 0 ? <p className="muted p-4">Nothing has been done from this console yet.</p> : null}

          {!loading && audit.length ? (
            <div className="overflow-x-auto">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Time">{formatDate(item.createdAt)}</td>
                      <td data-label="Action">{item.action.replaceAll(".", " ")}</td>
                      <td data-label="Target">
                        {item.targetType}
                        {item.targetId ? ` · ${item.targetId.slice(0, 8)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}
