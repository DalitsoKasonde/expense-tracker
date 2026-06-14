"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Account {
  id: string;
  name: string;
}

export default function AddPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [formData, setFormData] = useState({
    transactionDate: new Date().toISOString().split("T")[0],
    entryKind: "expense",
    amount: "",
    currency: "ZMW",
    accountId: "",
    categoryId: "uncategorized",
    note: "",
  });

  useEffect(() => {
    if (!session?.accessToken) return;

    const fetchAccounts = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/accounts`,
          {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
            },
          }
        );

        if (response.ok) {
          const json = await response.json();
          const accts = json || [];
          setAccounts(accts);
          if (accts.length > 0) {
            setFormData((prev) => ({ ...prev, accountId: accts[0].id }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch accounts", err);
      }
    };

    fetchAccounts();
  }, [session?.accessToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) {
      setError("Not authenticated");
      return;
    }

    if (!formData.accountId) {
      setError("Please select an account");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/transactions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({
            transactionDate: formData.transactionDate,
            entryKind: formData.entryKind,
            amount: Math.round(parseFloat(formData.amount) * 100),
            currency: formData.currency,
            accountId: formData.accountId,
            categoryId: formData.categoryId || undefined,
            note: formData.note || undefined,
            source: "manual",
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        setError(text || "Failed to create transaction");
        return;
      }

      setFormData({
        transactionDate: new Date().toISOString().split("T")[0],
        entryKind: "expense",
        amount: "",
        currency: "ZMW",
        accountId: accounts.length > 0 ? accounts[0].id : "",
        categoryId: "uncategorized",
        note: "",
      });

      router.push("/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating transaction");
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return <div className="shell">Loading...</div>;
  }

  if (accounts.length === 0) {
    return (
      <main className="shell">
        <section className="appChrome">
          <h1 className="pageTitle">Quick Add</h1>
          <p className="muted">No accounts configured. Please set up an account in settings first.</p>
          <Link href="/settings" className="primaryButton" style={{ display: "block", textAlign: "center" }}>
            Go to Settings
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Quick Add</h1>

        <form className="loginForm" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="amount">Amount (ZMW)</label>
            <input
              id="amount"
              name="amount"
              type="number"
              placeholder="0"
              value={formData.amount}
              onChange={handleChange}
              required
              step="0.01"
            />
          </div>

          <div className="field">
            <label htmlFor="entryKind">Type</label>
            <select
              id="entryKind"
              name="entryKind"
              value={formData.entryKind}
              onChange={handleChange}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="saving_transfer">Saving</option>
              <option value="investment_buy">Investment</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="accountId">Account</label>
            <select
              id="accountId"
              name="accountId"
              value={formData.accountId}
              onChange={handleChange}
              required
            >
              <option value="">Select account</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="note">Note (optional)</label>
            <input
              id="note"
              name="note"
              type="text"
              placeholder="Add a note..."
              value={formData.note}
              onChange={handleChange}
            />
          </div>

          {error && <p style={{ color: "red" }}>{error}</p>}

          <button type="submit" className="primaryButton" disabled={loading}>
            {loading ? "Saving..." : "Save Transaction"}
          </button>
        </form>

        <div style={{ marginTop: "1rem", textAlign: "center" }}>
          <Link href="/today" className="ghostButton">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
