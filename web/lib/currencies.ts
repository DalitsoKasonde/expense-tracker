export const supportedCurrencies = ["ZMW", "USD", "GBP", "EUR", "ZAR"] as const;

export type SupportedCurrency = (typeof supportedCurrencies)[number];
