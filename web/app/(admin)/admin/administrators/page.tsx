"use client";

import { PageHeader, PageShell } from "@/components/ui";
import { useApiCall } from "@/lib/client-api";
import { type FormEvent, useState } from "react";

export default function AdminAdministratorsPage() {
  const apiCall = useApiCall();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function createSystemAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
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
      form.reset();
      setMessage("System administrator created. Give them the password in person, not by email, and ask them to change it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The administrator could not be created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <PageShell>
      <div className="workspaceStack">
        <PageHeader
          eyebrow="System administration"
          title="Administrators"
          subtitle="Anyone you add here gets this whole console: the account list, invitations, backups and the audit trail. They still cannot see anyone's financial records."
        />

        {message ? <p className="statusText" role="status">{message}</p> : null}

        <section className="card settingsListPanel adminContentCard adminAdminFormCard">
          <div className="settingsHeaderRow">
            <div>
              <strong>Add an administrator</strong>
              <p className="muted">
                You choose their first password here. Existing administrators are not listed — by design, this
                console does not show administrator accounts.
              </p>
            </div>
          </div>
          <form className="settingsGrid" onSubmit={(event) => void createSystemAdmin(event)}>
            <div className="field">
              <label htmlFor="admin-display-name">Display name</label>
              <input id="admin-display-name" name="displayName" autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="admin-email">Email</label>
              <input id="admin-email" name="email" type="email" autoComplete="off" required />
            </div>
            <div className="field">
              <label htmlFor="admin-password">Initial password</label>
              <input id="admin-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              <span className="field-hint">At least eight characters, with a letter and a number.</span>
            </div>
            <div className="adminFormAction">
              <button className="btn btn-primary" type="submit" disabled={pending}>
                Create administrator
              </button>
            </div>
          </form>
        </section>
      </div>
    </PageShell>
  );
}
