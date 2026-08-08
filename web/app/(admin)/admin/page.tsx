"use client";

import { PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type AdminUser = { id: string; maskedEmail: string; role: string; isActive: boolean; createdAt: string; lastLoginAt?: string | null };
type BackupJob = { id: string; status: string; fileName?: string | null; sizeBytes?: number | null; checksumSha256?: string | null; errorMessage?: string | null; requestedAt: string; completedAt?: string | null };
type AuditLog = { id: string; action: string; targetType: string; targetId?: string | null; createdAt: string };
type FeedbackStatus = "new" | "reviewed" | "resolved";
type FeedbackItem = { id: string; maskedEmail: string; message: string; pagePath?: string; status: FeedbackStatus; createdAt: string };

const feedbackStatuses: FeedbackStatus[] = ["new", "reviewed", "resolved"];

function formatDate(value?: string | null) { return value ? new Date(value).toLocaleString() : "Never"; }
function formatBytes(value?: number | null) {
  if (!value) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value; let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export default function AdminPage() {
  const apiCall = useApiCall();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [backups, setBackups] = useState<BackupJob[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const activeUsers = useMemo(() => users.filter((user) => user.isActive).length, [users]);
  const newFeedbackCount = useMemo(() => feedback.filter((item) => item.status === "new").length, [feedback]);

  const loadData = useCallback(async () => {
    const [loadedUsers, loadedBackups, loadedAudit, loadedFeedback] = await Promise.all([
      apiCall<AdminUser[]>("/v1/admin/users"),
      apiCall<BackupJob[]>("/v1/admin/backups"),
      apiCall<AuditLog[]>("/v1/admin/audit"),
      apiCall<FeedbackItem[]>("/v1/admin/feedback"),
    ]);
    setUsers(loadedUsers ?? []); setBackups(loadedBackups ?? []); setAudit(loadedAudit ?? []); setFeedback(loadedFeedback ?? []);
  }, [apiCall]);

  useEffect(() => { void loadData().catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load administration data")).finally(() => setLoading(false)); }, [loadData]);

  async function setUserActive(user: AdminUser, isActive: boolean) {
    setPending(true); setMessage("");
    try {
      await apiCall(`/v1/admin/users/${user.id}/status`, { method: "PATCH", body: { isActive } });
      await loadData(); setMessage(isActive ? "User activated." : "User suspended.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to update user"); }
    finally { setPending(false); }
  }

  async function setFeedbackStatus(item: FeedbackItem, status: FeedbackStatus) {
    setPending(true); setMessage("");
    try {
      await apiCall(`/v1/admin/feedback/${item.id}/status`, { method: "PATCH", body: { status } });
      await loadData();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to update feedback"); }
    finally { setPending(false); }
  }

  async function requestBackup() {
    setPending(true); setMessage("");
    try {
      await apiCall("/v1/admin/backups", { method: "POST" });
      await loadData(); setMessage("Encrypted database backup requested.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to request backup"); }
    finally { setPending(false); }
  }

  async function createSystemAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await apiCall("/v1/admin/system-admins", {
        method: "POST",
        body: {
          email: String(data.get("email") ?? "").trim().toLowerCase(),
          displayName: String(data.get("displayName") ?? "").trim(),
          password: String(data.get("password") ?? ""),
        },
      });
      form.reset(); setMessage("System administrator created.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Failed to create system administrator"); }
    finally { setPending(false); }
  }

  return (
    <PageShell>
      <div className="workspaceStack">
        <section id="overview" className="grid scroll-mt-20 gap-6" aria-labelledby="admin-overview-title">
          <div id="admin-overview-title"><PageHeader eyebrow="System administration" title="Application operations" subtitle="Manage user access and encrypted backups without opening anyone's financial records." actions={<button className="btn btn-primary" type="button" disabled={pending} onClick={() => void requestBackup()}>Create encrypted backup</button>} /></div>
          <div className="statsGrid">
            <div className="statCard"><span className="muted">Registered users</span><strong>{users.length}</strong></div>
            <div className="statCard"><span className="muted">Active users</span><strong>{activeUsers}</strong></div>
            <div className="statCard"><span className="muted">Latest backup</span><strong>{backups[0]?.status ?? "None"}</strong></div>
            <div className="statCard"><span className="muted">New feedback</span><strong>{newFeedbackCount}</strong></div>
          </div>
        </section>
        {message ? <p className="statusText" role="status">{message}</p> : null}

        <section id="administrators" className="card settingsListPanel scroll-mt-20">
          <div className="settingsHeaderRow"><div><strong>Add a system administrator</strong><p className="muted">Create additional operational administrators after the first account has been bootstrapped.</p></div></div>
          <form className="settingsGrid" onSubmit={(event) => void createSystemAdmin(event)}>
            <div className="field"><label htmlFor="admin-display-name">Display name</label><input id="admin-display-name" name="displayName" autoComplete="name" /></div>
            <div className="field"><label htmlFor="admin-email">Email</label><input id="admin-email" name="email" type="email" autoComplete="off" required /></div>
            <div className="field"><label htmlFor="admin-password">Initial password</label><input id="admin-password" name="password" type="password" autoComplete="new-password" minLength={8} required /><span className="field-hint">Must contain at least one letter and one number.</span></div>
            <div className="field"><button className="btn btn-primary" type="submit" disabled={pending}>Create administrator</button></div>
          </form>
        </section>

        <section id="users" className="card settingsListPanel scroll-mt-20 overflow-hidden">
          <div className="settingsHeaderRow"><div><strong>Users</strong><p className="muted">Only masked identity and operational metadata are available.</p></div></div>
          {loading ? <p className="muted p-4">Loading users...</p> : null}
          {!loading ? <div className="overflow-x-auto"><table className="dataTable"><thead><tr><th>User</th><th>Joined</th><th>Last login</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td data-label="User"><strong>{user.maskedEmail}</strong></td><td data-label="Joined">{formatDate(user.createdAt)}</td><td data-label="Last login">{formatDate(user.lastLoginAt)}</td><td data-label="Status"><span className="metaBadge">{user.isActive ? "Active" : "Suspended"}</span></td><td data-label="Action"><button className={user.isActive ? "btn btn-danger" : "btn btn-primary"} type="button" disabled={pending} onClick={() => void setUserActive(user, !user.isActive)}>{user.isActive ? "Suspend" : "Activate"}</button></td></tr>)}</tbody></table></div> : null}
        </section>

        <section id="feedback" className="card settingsListPanel scroll-mt-20 overflow-hidden">
          <div className="settingsHeaderRow"><div><strong>Beta feedback</strong><p className="muted">Notes submitted from the app&apos;s &ldquo;Send feedback&rdquo; menu, newest first.</p></div></div>
          {loading ? <p className="muted p-4">Loading feedback...</p> : null}
          {!loading && feedback.length === 0 ? <p className="muted p-4">No feedback submitted yet.</p> : null}
          {!loading && feedback.length ? (
            <div className="overflow-x-auto">
              <table className="dataTable">
                <thead><tr><th>From</th><th>Message</th><th>Page</th><th>Received</th><th>Status</th></tr></thead>
                <tbody>
                  {feedback.map((item) => (
                    <tr key={item.id}>
                      <td data-label="From">{item.maskedEmail}</td>
                      <td data-label="Message" className="max-w-md whitespace-pre-wrap">{item.message}</td>
                      <td data-label="Page" className="font-mono text-xs">{item.pagePath || "—"}</td>
                      <td data-label="Received">{formatDate(item.createdAt)}</td>
                      <td data-label="Status">
                        <select
                          className="metaBadge"
                          value={item.status}
                          disabled={pending}
                          onChange={(event) => void setFeedbackStatus(item, event.target.value as FeedbackStatus)}
                        >
                          {feedbackStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section id="backups" className="card settingsListPanel scroll-mt-20 overflow-hidden">
          <div className="settingsHeaderRow"><div><strong>Encrypted backups</strong><p className="muted">Backups are stored encrypted. This console cannot download or inspect them.</p></div></div>
          <div className="overflow-x-auto"><table className="dataTable"><thead><tr><th>Requested</th><th>Status</th><th>Size</th><th>Checksum</th></tr></thead><tbody>{backups.map((job) => <tr key={job.id}><td data-label="Requested">{formatDate(job.requestedAt)}</td><td data-label="Status"><span className="metaBadge">{job.status}</span>{job.errorMessage ? <div className="text-negative">{job.errorMessage}</div> : null}</td><td data-label="Size">{formatBytes(job.sizeBytes)}</td><td data-label="Checksum" className="font-mono text-xs">{job.checksumSha256?.slice(0, 16) ?? "—"}</td></tr>)}</tbody></table></div>
        </section>

        <section id="audit" className="card settingsListPanel scroll-mt-20 overflow-hidden">
          <div className="settingsHeaderRow"><strong>Administrative audit trail</strong></div>
          <div className="overflow-x-auto"><table className="dataTable"><thead><tr><th>Time</th><th>Action</th><th>Target</th></tr></thead><tbody>{audit.map((item) => <tr key={item.id}><td data-label="Time">{formatDate(item.createdAt)}</td><td data-label="Action">{item.action.replaceAll(".", " ")}</td><td data-label="Target">{item.targetType}{item.targetId ? ` · ${item.targetId.slice(0, 8)}` : ""}</td></tr>)}</tbody></table></div>
        </section>
      </div>
    </PageShell>
  );
}
