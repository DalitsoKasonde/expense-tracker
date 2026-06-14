"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AddInvestmentPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    assetId: "",
    quantity: "",
    unitPrice: "",
    fees: "0",
    note: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) {
      setError("Not authenticated");
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
            transactionDate: new Date().toISOString().split("T")[0],
            entryKind: "investment_buy",
            amount: Math.round(parseFloat(formData.unitPrice) * parseFloat(formData.quantity) * 100),
            currency: "ZMW",
            accountId: "default",
            assetId: formData.assetId,
            quantity: parseFloat(formData.quantity),
            unitPrice: Math.round(parseFloat(formData.unitPrice) * 100),
            fees: Math.round(parseFloat(formData.fees) * 100) || undefined,
            note: formData.note || undefined,
            source: "manual",
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        setError(text || "Failed to create investment");
        return;
      }

      router.push("/investments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating investment");
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return <div className="shell">Loading...</div>;
  }

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Buy Investment</h1>

        <form className="grid gap-4 mt-6" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="assetId">Asset</label>
            <input
              id="assetId"
              name="assetId"
              type="text"
              placeholder="e.g., LuSE Stock, Treasury Bond"
              value={formData.assetId}
              onChange={handleChange}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="quantity">Quantity</label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              placeholder="0"
              value={formData.quantity}
              onChange={handleChange}
              required
              step="0.01"
            />
          </div>

          <div className="field">
            <label htmlFor="unitPrice">Unit Price (ZMW)</label>
            <input
              id="unitPrice"
              name="unitPrice"
              type="number"
              placeholder="0"
              value={formData.unitPrice}
              onChange={handleChange}
              required
              step="0.01"
            />
          </div>

          <div className="field">
            <label htmlFor="fees">Fees (ZMW, optional)</label>
            <input
              id="fees"
              name="fees"
              type="number"
              placeholder="0"
              value={formData.fees}
              onChange={handleChange}
              step="0.01"
            />
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

          {error && <p className="muted">{error}</p>}

          <button type="submit" className="primaryButton" disabled={loading}>
            {loading ? "Saving..." : "Buy"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/investments" className="ghostButton">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
