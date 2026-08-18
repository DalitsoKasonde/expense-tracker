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
