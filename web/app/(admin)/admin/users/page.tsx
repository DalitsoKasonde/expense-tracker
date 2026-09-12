"use client";

import { PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type AdminUser,
  describePlan,
  describePlanSource,
  isOnPremium,
} from "@/components/admin/admin-data";
import { AdminStatusPill } from "@/components/admin/status-pill";
import { AdminDate } from "@/components/admin/admin-date";

type PlanChange = { plan: string; months?: number; neverExpires?: boolean };

export default function AdminUsersPage() {
  const apiCall = useApiCall();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (email: string) => {
      const query = email ? `?email=${encodeURIComponent(email)}` : "";
      setUsers((await apiCall<AdminUser[]>(`/v1/admin/users${query}`)) ?? []);
    },
    [apiCall]
  );

  useEffect(() => {
    void load("")
      .catch((error) => setMessage(error instanceof Error ? error.message : "The accounts could not be loaded."))
      .finally(() => setLoading(false));
    // load is rebuilt each render by useApiCall; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = search.trim().toLowerCase();
    setPending(true);
    setMessage("");
    try {
      await load(email);
      setAppliedSearch(email);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The search could not be run.");
    } finally {
      setPending(false);
    }
  }

  async function clearSearch() {
    setSearch("");
    setPending(true);
    try {
      await load("");
      setAppliedSearch("");
      setMessage("");
    } finally {
      setPending(false);
    }
  }

  async function changePlan(user: AdminUser, change: PlanChange, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setPending(true);
    setMessage("");
    try {
      await apiCall(`/v1/admin/users/${user.id}/plan`, { method: "PATCH", body: change });
      await load(appliedSearch);
      setMessage(`Plan updated for ${user.maskedEmail}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The plan could not be changed.");
    } finally {
      setPending(false);
    }
  }

  async function setActive(user: AdminUser, isActive: boolean) {
    if (!isActive && !window.confirm(`Suspend ${user.maskedEmail}? They will be signed out and unable to sign in again until you restore them.`)) return;
    setPending(true);
    setMessage("");
    try {
      await apiCall(`/v1/admin/users/${user.id}/status`, { method: "PATCH", body: { isActive } });
      await load(appliedSearch);
      setMessage(isActive ? "Access restored." : "Account suspended.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The account could not be updated.");
    } finally {
      setPending(false);
    }
  }

  return (
    <PageShell>
      <div className="workspaceStack">
        <PageHeader
          eyebrow="System administration"
          title="People"
          subtitle="Every account except other administrators. Addresses are masked on purpose — nobody here can read a person's financial records."
        />

        <section className="card adminContentCard grid gap-3">
          <div className="grid gap-1">
            <h2 className="text-base font-semibold text-on-surface">Find an account</h2>
            <p className="muted text-sm">
              Masked addresses look alike, so type the full address to pick out one account — your own, for
              instance, when you want to put it on a plan that never expires.
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void runSearch(event)}>
            <div className="field min-w-60 flex-1">
              <label htmlFor="userSearch">Email address</label>
              <input
                id="userSearch"
                type="email"
                placeholder="someone@example.com"
                value={search}
                disabled={pending}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={pending}>
              Find
            </button>
            {appliedSearch ? (
              <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => void clearSearch()}>
                Show everyone
              </button>
            ) : null}
          </form>
        </section>

        {message ? <p className="statusText" role="status">{message}</p> : null}

        <section className="card settingsListPanel overflow-hidden">
          <div className="settingsHeaderRow">
            <div>
              <strong>{appliedSearch ? `Matching ${appliedSearch}` : "All accounts"}</strong>
              <p className="muted">
                {loading ? "Loading…" : `${users.length} ${users.length === 1 ? "account" : "accounts"}`}
              </p>
            </div>
          </div>

          {!loading && users.length === 0 ? (
            <p className="muted p-4">
              {appliedSearch ? "No account uses that address." : "No accounts have been created yet."}
            </p>
          ) : null}

          {!loading && users.length ? (
            <div className="overflow-x-auto">
              <table className="dataTable adminPeopleTable">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Plan</th>
                    <th>Change plan</th>
                    <th>Joined</th>
                    <th>Last signed in</th>
                    <th>Access</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className={!user.isActive ? "adminRow-muted" : undefined}>
                      <td data-label="Account">
                        <strong>{user.maskedEmail}</strong>
                        <span className="muted block text-xs">{describePlanSource(user)}</span>
                      </td>
                      <td data-label="Plan">
                        <AdminStatusPill tone={isOnPremium(user) ? "info" : "neutral"}>{describePlan(user)}</AdminStatusPill>
                      </td>
                      <td data-label="Change plan">
                        <span className="adminPlanActions">
                          <button
                            className="btn btn-outline btn-sm"
                            type="button"
                            disabled={pending}
                            onClick={() => void changePlan(user, { plan: "premium", neverExpires: true })}
                          >
                            Premium, no expiry
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            type="button"
                            disabled={pending}
                            onClick={() => void changePlan(user, { plan: "premium", months: 12 })}
                          >
                            Premium for 12 months
                          </button>
                          {isOnPremium(user) ? (
                            <button
                              className="btn btn-outline btn-sm"
                              type="button"
                              disabled={pending}
                              onClick={() =>
                                void changePlan(
                                  user,
                                  { plan: "free" },
                                  `Move ${user.maskedEmail} to the free plan? They lose premium immediately.`
                                )
                              }
                            >
                              Move to free
                            </button>
                          ) : null}
                        </span>
                      </td>
                      <td data-label="Joined"><AdminDate value={user.createdAt} /></td>
                      <td data-label="Last signed in"><AdminDate value={user.lastLoginAt} /></td>
                      <td data-label="Access">
                        <AdminStatusPill tone={user.isActive ? "success" : "danger"}>{user.isActive ? "Active" : "Suspended"}</AdminStatusPill>
                        <span className="adminPlanActions">
                          <button
                            className={user.isActive ? "btn btn-danger btn-sm" : "btn btn-primary btn-sm"}
                            type="button"
                            disabled={pending}
                            onClick={() => void setActive(user, !user.isActive)}
                          >
                            {user.isActive ? "Suspend" : "Restore"}
                          </button>
                        </span>
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
