export function formatMoney(
  amountMinor: number,
  currency = "ZMW",
  options: Intl.NumberFormatOptions = {},
) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function isPositiveEntry(entryKind: string) {
  return [
    "income_earned",
    "income_borrowed",
    "investment_income",
    "bond_principal_redemption",
  ].includes(entryKind);
}
