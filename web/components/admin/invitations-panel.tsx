"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { describeInvitation, formatDay, type Invitation } from "@/components/admin/admin-data";
import { AdminStatusPill, statusTone } from "@/components/admin/status-pill";

export type { Invitation };

export function InvitationsPanel() {
  const apiCall = useApiCall();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [months, setMonths] = useState(6);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setInvitations((await apiCall<Invitation[]>("/v1/admin/invitations")) ?? []);
    } catch {
      setInvitations([]);
    }
    // apiCall is recreated per render by useApiCall; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setMessage("");
    try {
      const result = await apiCall<{ emailed: boolean }>("/v1/admin/invitations", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), premiumMonths: months, note: note.trim() },
      });
      setMessage(
        result?.emailed
          ? `Invitation sent to ${email.trim().toLowerCase()}.`
          : "Invitation created, but the email could not be sent. Check the mail settings."
      );
      setEmail("");
      setNote("");
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The invitation could not be created.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(invitation: Invitation) {
    if (!window.confirm(`Revoke the invitation for ${invitation.email}? The link they were sent stops working.`)) return;
    setPending(true);
    setMessage("");
    try {
      await apiCall(`/v1/admin/invitations/${invitation.id}`, { method: "DELETE" });
      setMessage(`Invitation for ${invitation.email} revoked.`);
      await load();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The invitation could not be revoked.");
    } finally {
      setPending(false);
    }
  }

  const open = invitations.filter((invitation) => describeInvitation(invitation).status === "Open").length;

  return (
    <>
      <section className="card settingsListPanel adminContentCard">
        <div className="settingsHeaderRow">
          <div>
            <strong>Send an invitation</strong>
            <p className="muted">
              They set their own password when they accept. The link is good for 14 days.
            </p>
          </div>
        </div>

        <form className="grid gap-4" onSubmit={(event) => void invite(event)}>
          <div className="adminInvitationFields">
            <div className="field">
              <label htmlFor="inviteEmail">Email address</label>
              <input
                id="inviteEmail"
                type="email"
                required
                placeholder="someone@example.com"
                value={email}
                disabled={pending}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="inviteMonths">Premium months</label>
              <input
                id="inviteMonths"
                type="number"
                min={0}
                max={60}
                value={months}
                disabled={pending}
                onChange={(event) => setMonths(Number(event.target.value))}
              />
              <span className="field-hint">Counted from the day they accept.</span>
            </div>
          </div>

          <div className="field">
            <label htmlFor="inviteNote">Note</label>
            <input
              id="inviteNote"
              type="text"
              placeholder="Optional, for your own records"
              value={note}
              disabled={pending}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Working" : "Send invitation"}
            </button>
          </div>
        </form>

        {message ? <p className="statusText" role="status">{message}</p> : null}
      </section>

      <section className="card settingsListPanel overflow-hidden">
        <div className="settingsHeaderRow">
          <div>
            <strong>Sent invitations</strong>
            <p className="muted">
              {loading
                ? "Loading…"
                : `${invitations.length} ${invitations.length === 1 ? "invitation" : "invitations"}${open ? `, ${open} still open` : ""}`}
            </p>
          </div>
        </div>

        {!loading && invitations.length === 0 ? <p className="muted p-4">Nobody has been invited yet.</p> : null}

        {!loading && invitations.length ? (
          <div className="overflow-x-auto">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Status</th>
                  <th>Premium</th>
                  <th>Note</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => {
                  const { status, timing, premium, canRevoke } = describeInvitation(invitation);
                  return (
                    <tr key={invitation.id}>
                      <td data-label="Person">
                        <strong>{invitation.email}</strong>
                        <span className="muted block text-xs">Sent {formatDay(invitation.createdAt)}</span>
                      </td>
                      <td data-label="Status">
                        <AdminStatusPill tone={statusTone(status)}>{status}</AdminStatusPill>
                        <span className="muted block text-xs">{timing}</span>
                      </td>
                      <td data-label="Premium">{premium}</td>
                      <td data-label="Note">{invitation.note?.trim() || "—"}</td>
                      <td data-label="Action">
                        {canRevoke ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={pending}
                            onClick={() => void revoke(invitation)}
                          >
                            Revoke
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
