/**
 * Pure helpers behind the asset detail page.
 *
 * They were inline in a 1,600-line component, which meant the withholding-tax
 * arithmetic and the LuSE ticker table — the two things in that file most worth
 * checking — had no way to be tested. Nothing here touches the DOM or the API.
 */

/** Today in the `YYYY-MM-DD` form the date inputs and API expect. */
export function today() {
  return new Date().toISOString().split("T")[0];
}

/** Parses a money input into minor units, treating junk as zero. */
export function toMinor(value: string) {
  return Math.round((parseFloat(value || "0") || 0) * 100);
}

/** Clamps a percentage input to 0-100. */
export function toRate(value: string) {
  return Math.min(100, Math.max(0, parseFloat(value || "0") || 0));
}

/**
 * Withholding is entered as the rate the issuer applies; the amount deducted is
 * whatever that rate comes to on this coupon. Capped at the gross so a bad rate
 * cannot produce a larger deduction than the payment itself.
 */
export function taxMinorFromRate(grossMinor: number, rate: string) {
  return Math.min(grossMinor, Math.round((grossMinor * toRate(rate)) / 100));
}

/**
 * The rate that produced an already-recorded deduction, trimmed so a clean rate
 * shows as "15" rather than "15.0000".
 */
export function rateFromTaxMinor(grossMinor: number, taxMinor: number) {
  if (grossMinor <= 0) return "0";
  return String(parseFloat(((taxMinor / grossMinor) * 100).toFixed(4)));
}

export function formatPurchaseDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * LuSE tickers, resolved from an explicit symbol when there is one and from the
 * company name otherwise. Holdings imported from a spreadsheet often carry only
 * a name, and a quote lookup needs the ticker.
 */
export function inferLuSETicker(symbol: string | null | undefined, name: string) {
  const explicitSymbol = symbol?.trim().toUpperCase().replace(/\.ZM$/, "");
  if (explicitSymbol) {
    return explicitSymbol;
  }

  const normalizedName = name.trim().toLowerCase();
  const aliases: Array<[string, string]> = [
    ["airtel", "ATEL"],
    ["copperbelt energy", "CECZ"],
    ["zanaco", "ZNCO"],
    ["zambia national commercial", "ZNCO"],
    ["zambia sugar", "ZSUG"],
    ["standard chartered", "SCBL"],
    ["puma", "PUMA"],
    ["shoprite", "SHOP"],
    ["british american tobacco", "BATZ"],
    ["chilanga cement", "CHIL"],
    ["zambia reinsurance", "ZMRE"],
    ["zccm", "ZCCM-IH"],
    ["national breweries", "NATB"],
    ["bata", "BATA"],
  ];
  return aliases.find(([alias]) => normalizedName.includes(alias))?.[1] ?? "";
}

/**
 * Share counts as a person reads them: "150" rather than "150.0000", with
 * fractional shares (a reinvested dividend rarely buys a whole one) shown to
 * four places.
 */
export function formatShares(quantity: number) {
  return quantity.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export interface StockReturnInput {
  investedMinor: number;
  currentValueMinor: number;
  dividendTotalMinor: number;
  quantity: number;
}

/**
 * What a stock holding has actually done for you.
 *
 * The price move and the dividends are kept apart and then added: a dividend
 * is paid to a cash account, so the holding's value never reflects it, and a
 * reinvested one raises the cost basis by the same amount it adds here, so it
 * is counted once. Money banked by selling shares is in neither figure —
 * invested and current value both drop on a sale.
 */
export function stockReturn({ investedMinor, currentValueMinor, dividendTotalMinor, quantity }: StockReturnInput) {
  const priceReturnMinor = currentValueMinor - investedMinor;
  const totalReturnMinor = priceReturnMinor + dividendTotalMinor;
  const hasCost = investedMinor > 0;
  const hasShares = quantity > 0;
  return {
    priceReturnMinor,
    totalReturnMinor,
    totalReturnPercent: hasCost ? (totalReturnMinor / investedMinor) * 100 : null,
    costRecoveredPercent: hasCost ? (dividendTotalMinor / investedMinor) * 100 : null,
    // What a share is carried at today, from the last valuation.
    pricePerShareMinor: hasShares ? Math.round(currentValueMinor / quantity) : null,
    // The price at which the dividends have already made you whole; zero once
    // they have returned more than was paid.
    breakEvenPriceMinor: hasShares ? Math.max(0, Math.round((investedMinor - dividendTotalMinor) / quantity)) : null,
  };
}
