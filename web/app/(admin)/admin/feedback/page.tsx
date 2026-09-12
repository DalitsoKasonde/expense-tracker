"use client";

import { PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { useCallback, useEffect, useState } from "react";
import { type FeedbackItem, type FeedbackStatus, feedbackStatuses, formatDate } from "@/components/admin/admin-data";

export default function AdminFeedbackPage() {
  const apiCall = useApiCall();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setFeedback((await apiCall<FeedbackItem[]>("/v1/admin/feedback")) ?? []);
  }, [apiCall]);

  useEffect(() => {
    void load()
      .catch((error) => setMessage(error instanceof Error ? error.message : "The feedback could not be loaded."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function setStatus(item: FeedbackItem, status: FeedbackStatus) {
    setPending(true);
    setMessage("");
    try {
      await apiCall(`/v1/admin/feedback/${item.id}/status`, { method: "PATCH", body: { status } });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The status could not be changed.");
    } finally {
      setPending(false);
    }
  }

  const newCount = feedback.filter((item) => item.status === "new").length;

  return (
    <PageShell>
      <div className="workspaceStack">
        <PageHeader
          eyebrow="System administration"
          title="Feedback"
          subtitle="Notes people sent from the app's Send feedback menu, newest first. Mark one reviewed once you have read it, and resolved once you have acted on it."
        />

        {message ? <p className="statusText" role="status">{message}</p> : null}

        <section className="card settingsListPanel overflow-hidden">
          <div className="settingsHeaderRow">
            <div>
              <strong>{loading ? "Loading…" : `${feedback.length} ${feedback.length === 1 ? "note" : "notes"}`}</strong>
              <p className="muted">{newCount ? `${newCount} not yet read.` : "Nothing new."}</p>
            </div>
          </div>

          {!loading && feedback.length === 0 ? <p className="muted p-4">Nobody has sent feedback yet.</p> : null}

          {!loading && feedback.length ? (
            <div className="overflow-x-auto">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Message</th>
                    <th>Page</th>
                    <th>Received</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {feedback.map((item) => (
                    <tr key={item.id}>
                      <td data-label="From">{item.maskedEmail}</td>
                      <td data-label="Message" className="max-w-md whitespace-pre-wrap">{item.message}</td>
                      <td data-label="Page" className="font-mono text-xs">{item.pagePath || "—"}</td>
                      <td data-label="Received">{formatDate(item.createdAt)}</td>
                      <td data-label="Status">
                        <select
                          aria-label={`Status of the note from ${item.maskedEmail}`}
                          className="metaBadge"
                          value={item.status}
                          disabled={pending}
                          onChange={(event) => void setStatus(item, event.target.value as FeedbackStatus)}
                        >
                          {feedbackStatuses.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
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
