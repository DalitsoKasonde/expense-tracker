"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { getApiBaseUrl } from "@/lib/client-api";

type Account = {
  id: string;
  name: string;
  accountClass: string;
  currency: string;
};

export default function UploadPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountCurrency, setNewAccountCurrency] = useState("ZMW");
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session?.accessToken) {
      setAccountsLoading(false);
      return;
    }

    const loadAccounts = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/v1/accounts`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Failed to load accounts");
        }

        const rows = (await response.json()) as Account[];
        const assetAccounts = (rows ?? []).filter((account) => account.accountClass !== "liability");
        setAccounts(assetAccounts);
        setAccountId(assetAccounts[0]?.id ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load accounts");
      } finally {
        setAccountsLoading(false);
      }
    };

    void loadAccounts();
  }, [session?.accessToken]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const usingExistingAccount = accountId.trim() !== "";
    const usingNewAccount = newAccountName.trim() !== "";

    if (files.length === 0 || !session?.accessToken || (!usingExistingAccount && !usingNewAccount)) {
      setError("Choose at least one file and select or create an account");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      if (usingExistingAccount) {
        formData.append("accountId", accountId);
      }
      if (usingNewAccount) {
        formData.append("newAccountName", newAccountName.trim());
        formData.append("newAccountCurrency", newAccountCurrency);
      }
      files.forEach((file, index) => {
        formData.append("files", file);
        if (index === 0) {
          formData.append("file", file);
        }
      });

      const response = await fetch(`${getApiBaseUrl()}/v1/imports/excel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        const message = await response.text();
        setError(message || "Failed to upload files");
        return;
      }

      const result = await response.json();
      router.push(`/import/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  if (!session) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <PageHeader
          eyebrow="Imports"
          title="Upload workbooks"
          subtitle="Upload one or more yearly workbooks. You will review the transactions before they are added."
        />

        <form className="card settingsGrid" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="accountId">Import into account</label>
            <select
              id="accountId"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={accountsLoading || loading || accounts.length === 0 || newAccountName.trim() !== ""}
            >
              <option value="">Select account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 rounded-lg border border-outline bg-surface-soft p-4">
            <div className="resourceBody">
              <strong>Create an import account here</strong>
              <span className="muted">Use this if you have not set up accounts yet.</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <div className="field">
                <label htmlFor="newAccountName">New account name</label>
                <input
                  id="newAccountName"
                  value={newAccountName}
                  onChange={(event) => {
                    setNewAccountName(event.target.value);
                    if (event.target.value.trim() !== "") {
                      setAccountId("");
                    }
                  }}
                  placeholder="e.g. Imported cash history"
                  disabled={loading}
                />
              </div>
              <div className="field">
                <label htmlFor="newAccountCurrency">Currency</label>
                <select
                  id="newAccountCurrency"
                  value={newAccountCurrency}
                  onChange={(event) => setNewAccountCurrency(event.target.value)}
                  disabled={loading}
                >
                  <option value="ZMW">ZMW</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="file">Choose Excel files (.xlsx)</label>
            <input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              multiple
              onChange={handleFileChange}
              required
            />
          </div>

          {files.length > 0 ? (
            <div className="resourceBody">
              <strong>{files.length} file{files.length === 1 ? "" : "s"} selected</strong>
              <span className="muted">{files.map((file) => file.name).join(", ")}</span>
            </div>
          ) : null}

          <p className="muted">
            These legacy sheets do not store exact transaction dates. Each imported entry keeps its month and order, and the note explains that the final date is approximate within that month.
          </p>

          {error ? <p className="statusText">{error}</p> : null}

          <button
            type="submit"
            className="primaryButton"
            disabled={loading || accountsLoading}
          >
            {loading ? "Uploading..." : "Upload and prepare preview"}
          </button>
        </form>

        <div className="mt-4">
          <Link href="/import" className="ghostButton">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
