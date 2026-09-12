"use client";

import { PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { useCallback, useEffect, useState } from "react";
import { type BackupJob, formatBytes, formatDate } from "@/components/admin/admin-data";

export default function AdminBackupsPage() {
  const apiCall = useApiCall();
  const [backups, setBackups] = useState<BackupJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setBackups((await apiCall<BackupJob[]>("/v1/admin/backups")) ?? []);
  }, [apiCall]);

  useEffect(() => {
    void load()
      .catch((error) => setMessage(error instanceof Error ? error.message : "The backups could not be loaded."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestBackup() {
    setPending(true);
    setMessage("");
    try {
      await apiCall("/v1/admin/backups", { method: "POST" });
      await load();
      setMessage("Backup requested. It runs in the background — refresh in a minute to see it finish.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The backup could not be requested.");
    } finally {
      setPending(false);
    }
  }

  return (
    <PageShell>
      <div className="workspaceStack">
        <PageHeader
          eyebrow="System administration"
          title="Backups"
          subtitle="Request an encrypted copy of the database. Backups are stored encrypted, and this console can neither download nor read one."
          actions={
            <button className="btn btn-primary" type="button" disabled={pending} onClick={() => void requestBackup()}>
              Create encrypted backup
            </button>
          }
        />

        {message ? <p className="statusText" role="status">{message}</p> : null}

        <section className="card settingsListPanel overflow-hidden">
          <div className="settingsHeaderRow">
            <div>
              <strong>Backup history</strong>
              <p className="muted">{loading ? "Loading…" : `Latest: ${backups[0]?.status ?? "none yet"}`}</p>
            </div>
          </div>

          {!loading && backups.length === 0 ? <p className="muted p-4">No backup has been taken yet.</p> : null}

          {!loading && backups.length ? (
            <div className="overflow-x-auto">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Requested</th>
                    <th>Status</th>
                    <th>Size</th>
                    <th>Checksum</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((job) => (
                    <tr key={job.id}>
                      <td data-label="Requested">{formatDate(job.requestedAt)}</td>
                      <td data-label="Status">
                        <span className="metaBadge">{job.status}</span>
                        {job.errorMessage ? <div className="text-negative">{job.errorMessage}</div> : null}
                      </td>
                      <td data-label="Size">{formatBytes(job.sizeBytes)}</td>
                      <td data-label="Checksum" className="font-mono text-xs">{job.checksumSha256?.slice(0, 16) ?? "—"}</td>
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
