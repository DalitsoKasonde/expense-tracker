export type MarketStock = {
  ticker: string;
  name: string;
  currency: string;
  priceMinor: number;
};

export type MarketStockDirectory = {
  stocks: MarketStock[];
  updatedAt: string;
  sourceName: string;
  sourceUrl: string;
};
