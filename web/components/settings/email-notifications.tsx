"use client";

import { useEffect, useRef, useState } from "react";
import { useApiCall } from "@/lib/client-api";

export type DigestFrequency = "off" | "daily" | "weekly" | "monthly";

type NotificationType = {
  type: string;
  label: string;
  description: string;
};

type NotificationCatalogue = {
  mailEnabled: boolean;
  frequencies: DigestFrequency[];
  types: NotificationType[];
};

type EmailDelivery = {
  id: string;
  kind: string;
  subject: string;
  status: "sent" | "failed";
  createdAt: string;
};

const frequencyLabels: Record<DigestFrequency, string> = {
  off: "Never",
  daily: "Every day",
  weekly: "Every Monday",
  monthly: "First of the month",
};

const kindLabels: Record<string, string> = {
  digest: "Summary",
  password_reset: "Password reset",
  email_verification: "Address confirmation",
  report: "Statement",
  admin_alert: "Admin alert",
};

function formatSentAt(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Email delivery settings.
 *
 * The digest frequency and muted list belong to the preferences form so they
 * save with everything else; confirming an address and reading the delivery log
 * are self-contained actions and are owned here.
 */
export function EmailNotifications({
  frequency,
  mutedTypes,
  disabled,
  onChange,
}: {
  frequency: DigestFrequency;
  mutedTypes: string[];
  disabled: boolean;
  onChange: (next: { emailDigestFrequency: DigestFrequency; emailMutedNotificationTypes: string[] }) => void;
}) {
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;

  const [catalogue, setCatalogue] = useState<NotificationCatalogue | null>(null);
  const [deliveries, setDeliveries] = useState<EmailDelivery[]>([]);
  const [verifyStatus, setVerifyStatus] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    void apiCallRef.current<NotificationCatalogue>("/v1/notifications/types")
      .then(setCatalogue)
      .catch(() => setCatalogue(null));

    void apiCallRef.current<EmailDelivery[]>("/v1/user/emails")
      .then((result) => setDeliveries(result ?? []))
      .catch(() => setDeliveries([]));
  }, []);

  function toggleType(type: string, wanted: boolean) {
    // The stored list is what a person turned OFF, so a ticked box means the
    // type is absent from it.
    const next = wanted ? mutedTypes.filter((muted) => muted !== type) : [...mutedTypes, type];
    onChange({ emailDigestFrequency: frequency, emailMutedNotificationTypes: next });
  }

  async function sendVerification() {
    setVerifying(true);
    setVerifyStatus("");

    try {
      const result = await apiCallRef.current<{ alreadyVerified: boolean; sentTo?: string }>(
        "/v1/user/email/verify",
        { method: "POST", body: {} }
      );
      setVerifyStatus(
        result?.alreadyVerified
          ? "Your address is already confirmed."
          : `Confirmation link sent to ${result?.sentTo ?? "your address"}.`
      );
    } catch (caught) {
      setVerifyStatus(caught instanceof Error ? caught.message : "We could not send the confirmation link.");
    } finally {
      setVerifying(false);
    }
  }

  const digestsOn = frequency !== "off";

  return (
    <div className="settingsSection">
      <div className="card settingsFormPanel">
        <h2 className="text-lg font-semibold text-on-surface">Email</h2>

        {catalogue && !catalogue.mailEnabled ? (
          <p className="statusText" role="status">
            Email is not set up on this server yet, so nothing will actually be delivered. Your choices here
            are saved and take effect as soon as it is.
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="emailDigestFrequency">Email me a summary</label>
          <select
            id="emailDigestFrequency"
            value={frequency}
            onChange={(event) =>
              onChange({
                emailDigestFrequency: event.target.value as DigestFrequency,
                emailMutedNotificationTypes: mutedTypes,
              })
            }
            disabled={disabled}
          >
            {(catalogue?.frequencies ?? (["off", "daily", "weekly", "monthly"] as DigestFrequency[])).map(
              (option) => (
                <option key={option} value={option}>{frequencyLabels[option] ?? option}</option>
              )
            )}
          </select>
          <p className="field-hint">
            Daily summaries are only sent when something needs your attention. Weekly and monthly ones always
            include your figures.
          </p>
        </div>

        {digestsOn && catalogue?.types.length ? (
          <fieldset className="settingsFieldset">
            <legend className="text-sm font-semibold text-on-surface">What to include</legend>
            {catalogue.types.map((definition) => (
              <label key={definition.type} className="resourceRow settingsToggleRow" htmlFor={`notify-${definition.type}`}>
                <span className="resourceBody">
                  <strong>{definition.label}</strong>
                  <span className="muted">{definition.description}</span>
                </span>
                <input
                  id={`notify-${definition.type}`}
                  type="checkbox"
                  checked={!mutedTypes.includes(definition.type)}
                  onChange={(event) => toggleType(definition.type, event.target.checked)}
                  disabled={disabled}
                />
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className="resourceRow settingsToggleRow">
          <span className="resourceBody">
            <strong>Confirm your email address</strong>
            <span className="muted">
              A confirmed address is what lets us send you a password reset if you ever need one.
            </span>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void sendVerification()} disabled={verifying}>
            {verifying ? "Sending" : "Send link"}
          </button>
        </div>
        {verifyStatus ? <p className="statusText" role="status">{verifyStatus}</p> : null}

        {deliveries.length ? (
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold text-on-surface">Recently sent</h3>
            <ul className="resourceList">
              {deliveries.map((delivery) => (
                <li key={delivery.id} className="resourceRow">
                  <span className="resourceBody">
                    <strong>{delivery.subject}</strong>
                    <span className="muted">
                      {kindLabels[delivery.kind] ?? delivery.kind} · {formatSentAt(delivery.createdAt)}
                      {delivery.status === "failed" ? " · could not be delivered" : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
