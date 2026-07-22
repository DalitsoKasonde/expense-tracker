"use client";

import { useEffect, useRef, useState } from "react";
import { useApiCall } from "@/lib/client-api";
import { applyTheme } from "@/components/preference-theme-sync";
import { primeUserCurrency } from "@/lib/use-user-currency";

type UserPreferences = {
  defaultCurrency: string;
  theme: "light" | "dark";
  notificationsEnabled: boolean;
};

export default function PreferencesSettingsPage() {
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const [form, setForm] = useState<UserPreferences>({
    defaultCurrency: "ZMW",
    theme: "light",
    notificationsEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const lastSavedRef = useRef<string>("");
  const saveVersionRef = useRef(0);

  useEffect(() => {
    void apiCallRef.current<UserPreferences>("/v1/user/preferences")
      .then((prefs) => {
        setForm(prefs);
        lastSavedRef.current = JSON.stringify(prefs);
        primeUserCurrency(prefs.defaultCurrency);
        applyTheme(prefs.theme);
        setHasLoaded(true);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Failed to load preferences"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!hasLoaded || loading) {
      return;
    }

    const serializedForm = JSON.stringify(form);
    if (serializedForm === lastSavedRef.current) {
      return;
    }

    const saveVersion = ++saveVersionRef.current;
    setStatus("Saving preferences...");

    const timeoutId = window.setTimeout(() => {
      void apiCallRef.current<UserPreferences>("/v1/user/preferences", {
        method: "PATCH",
        body: form,
      })
        .then((prefs) => {
          if (saveVersion !== saveVersionRef.current) {
            return;
          }

          setForm(prefs);
          lastSavedRef.current = JSON.stringify(prefs);
          primeUserCurrency(prefs.defaultCurrency);
          applyTheme(prefs.theme);
          setStatus("Preferences saved.");
        })
        .catch((error) => {
          if (saveVersion !== saveVersionRef.current) {
            return;
          }

          setStatus(error instanceof Error ? error.message : "Failed to save preferences");
        });
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [form, hasLoaded, loading]);

  return (
    <section className="settingsSection">
      <form className="card settingsFormPanel">
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

        {status ? <p className="statusText">{status}</p> : null}
        {!status && hasLoaded ? <p className="statusText">Changes save automatically.</p> : null}
      </form>
    </section>
  );
}
