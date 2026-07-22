"use client";

import { useApiCall } from "@/lib/client-api";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useUserCurrency } from "./use-user-currency";

export interface UnifiedDashboardAccountBalance {
  accountId: string;
  name: string;
  accountType: string;
  accountClass: "asset" | "liability";
  currency: string;
  balanceMinor: number;
}

export interface UnifiedDashboardAsset {
  assetId: string;
  name: string;
  symbol?: string | null;
  assetClass: string;
  currency: string;
  investedAmountMinor: number;
  currentValueMinor: number;
}

export interface UnifiedDashboardData {
  asOfDate: string;
  currency: string;
  income: number;
  borrowed: number;
  interestReceived: number;
  expense: number;
  livingExpense: number;
  debtInterestFees: number;
  debtPrincipal: number;
  saving: number;
  investment: number;
  totalInflow: number;
  operatingBalance: number;
  freeCashFlow: number;
  netCashFlow: number;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  cashBalance: number;
  investmentValue: number;
  accountBalances: UnifiedDashboardAccountBalance[];
  assets: UnifiedDashboardAsset[];
}

export function useUnifiedDashboard(currency?: string) {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;
  const { currency: userCurrency, loading: currencyLoading } = useUserCurrency();

  const [data, setData] = useState<UnifiedDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken || currencyLoading) {
      setLoading(false);
      return;
    }

    let ignore = false;
    const fetchDashboard = async () => {
      try {
        const reportingCurrency = currency ?? userCurrency;
        const result = await apiCallRef.current<UnifiedDashboardData>(
          `/v1/dashboard/unified?currency=${encodeURIComponent(reportingCurrency)}`
        );
        if (!ignore) {
          setData(result ?? null);
          setError(null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void fetchDashboard();
    return () => {
      ignore = true;
    };
  }, [currency, currencyLoading, session?.accessToken, userCurrency]);

  return { data, loading, error };
}
