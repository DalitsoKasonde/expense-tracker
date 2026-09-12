"use client";

import Link from "next/link";
import { PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { useEffect, useState } from "react";
import { type AdminUser, type BackupJob, type FeedbackItem, formatDate, isOnPremium } from "@/components/admin/admin-data";
import type { Invitation } from "@/components/admin/invitations-panel";
import { adminSections } from "@/components/admin/admin-sections";

type Attention = { key: string; text: string; href: (typeof adminSections)[number]["href"]; action: string };

/** The console is only useful if it says what needs doing. Everything here is
 *  something an operator would otherwise have to go looking for section by
 *  section, which is exactly what the single scrolling page used to force. */
function whatNeedsAttention(
  users: AdminUser[],
  feedback: FeedbackItem[],
  invitations: Invitation[],
  backups: BackupJob[]
): Attention[] {
  const items: Attention[] = [];

  const unread = feedback.filter((item) => item.status === "new").length;
  if (unread) {
    items.push({
      key: "feedback",
      text: `${unread} ${unread === 1 ? "note has" : "notes have"} not been read yet.`,
      href: "/admin/feedback" as Attention["href"],
      action: "Read feedback",
    });
  }

  const open = invitations.filter(
    (invitation) => !invitation.acceptedAt && !invitation.revokedAt && new Date(invitation.expiresAt).getTime() >= Date.now()
  ).length;
  if (open) {
    items.push({
      key: "invitations",
      text: `${open} ${open === 1 ? "invitation is" : "invitations are"} still waiting to be accepted.`,
      href: "/admin/invitations" as Attention["href"],
      action: "See invitations",
    });
  }

  const suspended = users.filter((user) => !user.isActive).length;
  if (suspended) {
    items.push({
      key: "suspended",
      text: `${suspended} ${suspended === 1 ? "account is" : "accounts are"} suspended and cannot sign in.`,
      href: "/admin/users" as Attention["href"],
      action: "Review accounts",
    });
  }

  const latest = backups[0];
  if (!latest) {
    items.push({
      key: "backup-missing",
      text: "No database backup has ever been taken.",
      href: "/admin/backups" as Attention["href"],
      action: "Take a backup",
    });
  } else if (latest.status === "failed") {
    items.push({
      key: "backup-failed",
      text: `The most recent backup failed${latest.errorMessage ? `: ${latest.errorMessage}` : "."}`,
      href: "/admin/backups" as Attention["href"],
      action: "Try again",
    });
  }

  return items;
}

export default function AdminPage() {
  const apiCall = useApiCall();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [backups, setBackups] = useState<BackupJob[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void Promise.all([
      apiCall<AdminUser[]>("/v1/admin/users"),
      apiCall<BackupJob[]>("/v1/admin/backups"),
      apiCall<FeedbackItem[]>("/v1/admin/feedback"),
      apiCall<Invitation[]>("/v1/admin/invitations"),
    ])
      .then(([loadedUsers, loadedBackups, loadedFeedback, loadedInvitations]) => {
        setUsers(loadedUsers ?? []);
        setBackups(loadedBackups ?? []);
        setFeedback(loadedFeedback ?? []);
        setInvitations(loadedInvitations ?? []);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "The overview could not be loaded."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attention = whatNeedsAttention(users, feedback, invitations, backups);
  const premium = users.filter(isOnPremium).length;
  const workspaces = adminSections.filter((section) => section.href !== "/admin");

  return (
    <PageShell>
      <div className="workspaceStack">
        <PageHeader
          eyebrow="System administration"
          title="Overview"
          subtitle="Running the service: who can use it, what they are entitled to, and whether the data is safe. Nothing here can open anyone's financial records."
        />

        {message ? <p className="statusText" role="status">{message}</p> : null}

        <div className="statsGrid">
          <Link className="statCard" href="/admin/users">
            <span className="muted">Accounts</span>
            <strong>{loading ? "—" : users.length}</strong>
          </Link>
          <Link className="statCard" href="/admin/users">
            <span className="muted">On premium</span>
            <strong>{loading ? "—" : premium}</strong>
          </Link>
          <Link className="statCard" href="/admin/feedback">
            <span className="muted">Unread feedback</span>
            <strong>{loading ? "—" : feedback.filter((item) => item.status === "new").length}</strong>
          </Link>
          <Link className="statCard" href="/admin/backups">
            <span className="muted">Last backup</span>
            <strong>{loading ? "—" : backups[0] ? formatDate(backups[0].requestedAt) : "None"}</strong>
          </Link>
        </div>

        <section className="card settingsListPanel">
          <div className="settingsHeaderRow">
            <div>
              <strong>Needs attention</strong>
              <p className="muted">Things waiting on you right now.</p>
            </div>
          </div>
          {loading ? <p className="muted p-4">Checking…</p> : null}
          {!loading && attention.length === 0 ? (
            <p className="muted p-4">Nothing is waiting. Feedback is read, invitations are settled and a backup exists.</p>
          ) : null}
          {!loading && attention.length ? (
            <ul className="resourceList">
              {attention.map((item) => (
                <li key={item.key} className="resourceRow">
                  <span className="resourceBody">
                    <strong>{item.text}</strong>
                  </span>
                  <Link className="btn btn-ghost btn-sm" href={item.href}>
                    {item.action}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold text-on-surface">Where things are</h2>
            <p className="muted text-sm">Each of these is its own page, also in the sidebar.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {workspaces.map((section) => (
              <Link key={section.href} className="card card-pad grid content-start gap-1" href={section.href}>
                <strong className="text-on-surface">{section.label}</strong>
                <span className="muted text-sm leading-6">{section.description}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
