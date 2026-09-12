"use client";

import { PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { useCallback, useEffect, useState } from "react";
import { type FeedbackItem, type FeedbackStatus } from "@/components/admin/admin-data";
import { AdminDate } from "@/components/admin/admin-date";
import { AdminStatusPill, statusTone } from "@/components/admin/status-pill";

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
      window.dispatchEvent(new Event("admin-feedback-updated"));
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

        <section className="card settingsListPanel adminFeedbackCard overflow-hidden">
          <div className="settingsHeaderRow">
            <div>
              <strong>{loading ? "Loading…" : `${feedback.length} ${feedback.length === 1 ? "note" : "notes"}`}</strong>
              <p className="muted">{newCount ? `${newCount} not yet read.` : "Nothing new."}</p>
            </div>
          </div>

          {!loading && feedback.length === 0 ? <p className="muted p-4">Nobody has sent feedback yet.</p> : null}

          {!loading && feedback.length ? (
            <ul className="adminFeedbackList">
              {feedback.map((item) => (
                <li className="adminFeedbackRow" key={item.id}>
                  <div className="adminFeedbackMeta">
                    <AdminStatusPill tone={statusTone(item.status)} compact>{item.status}</AdminStatusPill>
                    <strong>{item.maskedEmail}</strong>
                    <AdminDate value={item.createdAt} />
                  </div>
                  <div className="adminFeedbackBody">
                    <p>{item.message}</p>
                    {item.pagePath ? <span className="adminReference">{item.pagePath}</span> : null}
                  </div>
                  <div className="adminFeedbackAction">
                    {item.status === "new" ? (
                      <button className="btn btn-outline btn-sm" type="button" disabled={pending} onClick={() => void setStatus(item, "reviewed")}>
                        Mark reviewed
                      </button>
                    ) : item.status === "reviewed" ? (
                      <button className="btn btn-outline btn-sm" type="button" disabled={pending} onClick={() => void setStatus(item, "resolved")}>
                        Mark resolved
                      </button>
                    ) : (
                      <span className="adminResolvedLabel">Resolved</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </PageShell>
  );
}
