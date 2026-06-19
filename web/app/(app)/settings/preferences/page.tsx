"use client";

import { useEffect, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { applyTheme } from "@/components/preference-theme-sync";

type UserPreferences = {
  defaultCurrency: string;
  theme: "light" | "dark";
  notificationsEnabled: boolean;
};

export default function PreferencesSettingsPage() {
  const apiCall = useApiCall();
  const [form, setForm] = useState<UserPreferences>({
    defaultCurrency: "ZMW",
    theme: "light",
    notificationsEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void apiCall<UserPreferences>("/v1/user/preferences")
      .then((prefs) => {
        setForm(prefs);
        applyTheme(prefs.theme);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load preferences"))
      .finally(() => setLoading(false));
  }, [apiCall]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setStatus("");

    try {
      const prefs = await apiCall<UserPreferences>("/v1/user/preferences", {
        method: "PATCH",
        body: form,
      });
      setForm(prefs);
      applyTheme(prefs.theme);
      setStatus("Preferences saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settingsSection">
      <div className="card settingsLeadCard">
        <p className="sectionKicker">Preferences</p>
        <h2 className="sectionHeading">Everyday defaults</h2>
        <p className="muted">These settings shape the live experience across the app, not just this workspace.</p>
      </div>

      <form className="card settingsFormPanel" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="defaultCurrency">Default currency</label>
          <select
            id="defaultCurrency"
            value={form.defaultCurrency}
            onChange={(event) => setForm((current) => ({ ...current, defaultCurrency: event.target.value }))}
            disabled={loading}
          >
            <option value="ZMW">ZMW</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            value={form.theme}
            onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value as "light" | "dark" }))}
            disabled={loading}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <label className="resourceRow settingsToggleRow" htmlFor="notificationsEnabled">
          <span className="resourceBody">
            <strong>Notifications</strong>
            <span className="muted">Control reminder-style notifications for your account.</span>
          </span>
          <input
            id="notificationsEnabled"
            type="checkbox"
            checked={form.notificationsEnabled}
            onChange={(event) =>
              setForm((current) => ({ ...current, notificationsEnabled: event.target.checked }))
            }
            disabled={loading}
          />
        </label>

        <div className="formActions">
          <button className="primaryButton" type="submit" disabled={saving || loading}>
            {saving ? "Saving..." : "Save preferences"}
          </button>
        </div>

        {status ? <p className="statusText">{status}</p> : null}
      </form>
    </section>
  );
}
