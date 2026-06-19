"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppPageHeader } from "@/components/app-page-header";
import { HistoryIcon } from "@/components/nav-icons";
import { useApiCall } from "@/lib/client-api";
import { getPendingTransactions } from "@/lib/offline-db";

interface Transaction {
  id: string;
  transactionDate: string;
  entryKind: string;
  amount: number;
  currency: string;
  note?: string;
  isPending?: boolean;
}

type FilterKey = "all" | "inflow" | "outflow" | "pending";

export default function TransactionsPage() {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    let ignore = false;
    const fetchTransactions = async () => {
      try {
        const apiFn = apiCallRef.current;
        const json = await apiFn<Transaction[]>("/v1/transactions?limit=50");

        const pending = await getPendingTransactions();
        const pendingTxList = pending.map((item) => ({
          id: item.id,
          transactionDate: item.payload.transactionDate,
          entryKind: item.payload.entryKind,
          amount: item.payload.amount,
          currency: item.payload.currency,
          note: item.payload.note,
          isPending: true,
        }));

        if (!ignore) {
          setTransactions([...pendingTxList, ...(json ?? [])]);
        }
      } catch (err) {
        console.error("Failed to fetch transactions", err);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void fetchTransactions();
    return () => { ignore = true; };
  }, [session?.accessToken]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const searchTarget = `${tx.note ?? ""} ${tx.entryKind}`.toLowerCase();
      const matchesQuery = query.trim() === "" || searchTarget.includes(query.trim().toLowerCase());
      const isPositive =
        tx.entryKind === "income_earned" ||
        tx.entryKind === "income_borrowed" ||
        tx.entryKind === "investment_income" ||
        tx.entryKind === "bond_principal_redemption";
      const matchesFilter =
        filter === "all" ||
        (filter === "inflow" && isPositive) ||
        (filter === "outflow" && !isPositive) ||
        (filter === "pending" && tx.isPending);

      return matchesQuery && matchesFilter;
    });
  }, [filter, query, transactions]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const tx of filteredTransactions) {
      const date = new Date(tx.transactionDate);
      date.setHours(0, 0, 0, 0);
      const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);
      const label =
        diffDays === 0
          ? "Today"
          : diffDays === 1
            ? "Yesterday"
            : date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

      const bucket = groups.get(label) ?? [];
      bucket.push(tx);
      groups.set(label, bucket);
    }

    return Array.from(groups.entries());
  }, [filteredTransactions]);

  if (loading) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome workspaceStack">
        <AppPageHeader
          eyebrow="Inscribed ledger"
          title="History"
          accent="Recorded with calm precision"
          lead="Search, filter, and scan the latest transaction history without losing the feel of a composed paper ledger."
          icon={HistoryIcon}
        />

        <section className="card historyToolbar">
          <div className="field historySearchField">
            <label htmlFor="history-search">Search</label>
            <input
              id="history-search"
              type="text"
              placeholder="Search transactions..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="historyFilterCluster" role="tablist" aria-label="History filters">
            {([
              ["all", "All"],
              ["inflow", "Inflow"],
              ["outflow", "Outflow"],
              ["pending", "Pending"],
            ] as Array<[FilterKey, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "choiceChip active" : "choiceChip"}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="historyTimeline">
          <div className="sectionHeader">
            <div className="sectionHeaderCopy">
              <p className="sectionKicker">Ledger view</p>
              <h2 className="sectionHeading">Transaction timeline</h2>
            </div>
            <Link href="/add" className="primaryButton">
              Add entry
            </Link>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="card resourceBody">
              <strong>No transactions yet</strong>
              <span className="muted">
                The ledger is empty right now. Add an entry and it will show up here immediately.
              </span>
            </div>
          ) : (
            <div className="historyGroups">
              {groupedTransactions.map(([label, items]) => (
                <section key={label} className="historyGroup">
                  <div className="historyGroupHeader">
                    <h3 className="historyGroupLabel">{label}</h3>
                    <div className="historyDivider" aria-hidden="true" />
                  </div>

                  <div className="ledgerList">
                    {items.map((tx) => {
                      const isPositive =
                        tx.entryKind === "income_earned" ||
                        tx.entryKind === "income_borrowed" ||
                        tx.entryKind === "investment_income" ||
                        tx.entryKind === "bond_principal_redemption";
                      const transactionDate = new Date(tx.transactionDate);

                      return (
                        <div key={tx.id} className="ledgerRow historyRow">
                          <div className="ledgerDateBlock">
                            <span className="ledgerDateDay">{transactionDate.getDate()}</span>
                            <span className="ledgerDateMonth">
                              {transactionDate.toLocaleDateString(undefined, { month: "short" })}
                            </span>
                          </div>
                          <div className="ledgerPrimary">
                            <p className="ledgerTitle">{tx.note?.trim() || tx.entryKind.replaceAll("_", " ")}</p>
                            <div className="ledgerMeta">
                              <span className="metaBadge">
                                {tx.isPending ? "Pending sync" : tx.entryKind.replaceAll("_", " ")}
                              </span>
                              <span className="muted">{transactionDate.toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="ledgerAmountBlock">
                            <span className={isPositive ? "ledgerAmount positive" : "ledgerAmount negative"}>
                              {isPositive ? "+" : "-"}
                              {tx.currency} {(tx.amount / 100).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <div className="formActions">
          <Link href="/today" className="ghostButton">
            Back to dashboard
          </Link>
          <Link href="/settings" className="ghostButton">
            Review settings
          </Link>
        </div>
      </section>
    </main>
  );
}
