import type { Address } from "viem";

export type Asset = { symbol: string; name: string; address: Address };

export type Market = {
  key: "stocks" | "crypto";
  label: string;
  /** short tagline shown on the mode toggle */
  hours: string;
  battle: Address;
  relay: Address;
  assets: Asset[];
};

const STOCKS: Asset[] = [
  { symbol: "TSLA", name: "Tesla", address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" },
  { symbol: "AMZN", name: "Amazon", address: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02" },
  { symbol: "PLTR", name: "Palantir", address: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0" },
  { symbol: "NFLX", name: "Netflix", address: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93" },
  { symbol: "AMD", name: "AMD", address: "0x71178BAc73cBeb415514eB542a8995b82669778d" },
];

const CRYPTO: Asset[] = [
  { symbol: "BTC", name: "Bitcoin", address: "0x69c88A0Ec0266c9Ab7450454Ef33c541420F9ce2" },
  { symbol: "ETH", name: "Ethereum", address: "0x6cD32d64CCE33753D905CD95b7Cf5d822F566dDF" },
  { symbol: "BNB", name: "BNB", address: "0xCD02e4444900Fc9D3d2Ad0729c7c6d72aFF20DFd" },
  { symbol: "SOL", name: "Solana", address: "0x7f1985ADf8D2e09Ebc3A193D1a832130d4f29a40" },
  { symbol: "XRP", name: "XRP", address: "0xCccb6536d8FEE02776f847fDa40A5Ce3a827e43D" },
];

export const MARKETS: Record<"stocks" | "crypto", Market> = {
  stocks: {
    key: "stocks",
    label: "Stocks",
    hours: "24/5",
    battle: "0xDe530201016Cad12DE4dE169885E4576526832F7",
    relay: "0xA8799b40d1BD22CfD23AEf49561B41A156C64622",
    assets: STOCKS,
  },
  crypto: {
    key: "crypto",
    label: "Crypto",
    hours: "24/7",
    battle: "0xf22F98fACbF7e1020F6EF6B386dF17d57C82827C",
    relay: "0xbe1DCb3FBfDefd0962801a77e534C97F6468e4af",
    assets: CRYPTO,
  },
};
