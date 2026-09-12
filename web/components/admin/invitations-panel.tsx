"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { describeInvitation, type Invitation } from "@/components/admin/admin-data";

export type { Invitation };

export function InvitationsPanel() {
  const apiCall = useApiCall();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [months, setMonths] = useState(6);
  const [note, setNote] = useState("");
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
    void load();
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

  return (
    <section className="card card-pad grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-on-surface">Beta invitations</h2>
        <span className="muted text-sm">
          An invited person sets their own password and starts with premium included. The link is good for 14
          days; their premium months only start counting once they accept.
        </span>
      </div>

      <form className="grid gap-3 sm:grid-cols-[2fr_auto_auto] sm:items-end" onSubmit={(event) => void invite(event)}>
        <div className="field">
          <label htmlFor="inviteEmail">Email address</label>
          <input
            id="inviteEmail"
            type="email"
            required
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
          <span className="field-hint">Counted from the day they accept, not from today.</span>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Working" : "Send invitation"}
        </button>
        <div className="field sm:col-span-3">
          <label htmlFor="inviteNote">Note (optional, for your own records)</label>
          <input
            id="inviteNote"
            type="text"
            value={note}
            disabled={pending}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </form>

      {message ? <p className="statusText" role="status">{message}</p> : null}

      {invitations.length ? (
        <ul className="resourceList">
          {invitations.map((invitation) => {
            const { status, detail } = describeInvitation(invitation);
            return (
              <li key={invitation.id} className="resourceRow">
                <span className="resourceBody">
                  <strong>{invitation.email}</strong>
                  <span className="muted">
                    <span className="metaBadge">{status}</span> {detail}
                    {invitation.note ? ` · ${invitation.note}` : ""}
                  </span>
                </span>
                {status === "Open" ? (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => void revoke(invitation)}>
                    Revoke
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted text-sm">No invitations yet.</p>
      )}
    </section>
  );
}
