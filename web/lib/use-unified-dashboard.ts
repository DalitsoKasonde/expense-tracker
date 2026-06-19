"use client";

import { useApiCall } from "@/lib/client-api";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

export interface UnifiedDashboardAccountBalance {
  accountId: string;
  name: string;
  accountType: string;
  accountClass: string;
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

export function useUnifiedDashboard(currency = "ZMW") {
  const { data: session } = useSession();
  const apiCall = useApiCall();
  const apiCallRef = useRef(apiCall);
  apiCallRef.current = apiCall;

  const [data, setData] = useState<UnifiedDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken) {
      setLoading(false);
      return;
    }

    let ignore = false;
    const fetchDashboard = async () => {
      try {
        const result = await apiCallRef.current<UnifiedDashboardData>(
          `/v1/dashboard/unified?currency=${encodeURIComponent(currency)}`
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
  }, [currency, session?.accessToken]);

  return { data, loading, error };
}
