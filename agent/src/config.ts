import "dotenv/config";
import { defineChain, type Address } from "viem";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ROBINHOOD_RPC ?? "https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" } },
});

export const BOSS_KEY = requireEnv("PRIVATE_KEY") as `0x${string}`;

export const ADDRESSES = {
  vault: (process.env.VAULT ?? "0x83FE2617202FC720A50E3e194596c99861B84BBE") as Address,
  router: "0x2953A82d44fDACfa7a49BfFF24f7Cc5879F10805" as Address,
  usdg: "0x7E955252E15c84f5768B83c41a71F9eba181802F" as Address,
};

export type Asset = { symbol: string; address: Address };

/** How the keeper sources prices for a market's assets. */
export type PriceSource = "router" | "coingecko";

export type Market = {
  key: "stocks" | "crypto";
  label: string;
  battle: Address;
  relay: Address;
  assets: Asset[];
  priceSource: PriceSource;
  /** true = ignore the weekday guard, always sign market open (crypto). */
  always247: boolean;
};

const STOCKS: Asset[] = [
  { symbol: "TSLA", address: "0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E" },
  { symbol: "AMZN", address: "0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02" },
  { symbol: "PLTR", address: "0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0" },
  { symbol: "NFLX", address: "0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93" },
  { symbol: "AMD", address: "0x71178BAc73cBeb415514eB542a8995b82669778d" },
];

// Virtual price-keys; no real crypto tokens on this testnet. CoinGecko id in symbol map below.
const CRYPTO: Asset[] = [
  { symbol: "BTC", address: "0x69c88A0Ec0266c9Ab7450454Ef33c541420F9ce2" },
  { symbol: "ETH", address: "0x6cD32d64CCE33753D905CD95b7Cf5d822F566dDF" },
  { symbol: "BNB", address: "0xCD02e4444900Fc9D3d2Ad0729c7c6d72aFF20DFd" },
  { symbol: "SOL", address: "0x7f1985ADf8D2e09Ebc3A193D1a832130d4f29a40" },
  { symbol: "XRP", address: "0xCccb6536d8FEE02776f847fDa40A5Ce3a827e43D" },
];

/** Symbol -> CoinGecko id / Binance pair, for the crypto keeper feed. */
export const CRYPTO_FEEDS: Record<string, { coingecko: string; binance: string }> = {
  BTC: { coingecko: "bitcoin", binance: "BTCUSDT" },
  ETH: { coingecko: "ethereum", binance: "ETHUSDT" },
  BNB: { coingecko: "binancecoin", binance: "BNBUSDT" },
  SOL: { coingecko: "solana", binance: "SOLUSDT" },
  XRP: { coingecko: "ripple", binance: "XRPUSDT" },
};

export const MARKETS: Market[] = [
  {
    key: "stocks",
    label: "Stocks",
    battle: (process.env.BATTLE ?? "0xDe530201016Cad12DE4dE169885E4576526832F7") as Address,
    relay: (process.env.RELAY ?? "0xA8799b40d1BD22CfD23AEf49561B41A156C64622") as Address,
    assets: STOCKS,
    priceSource: "router",
    always247: false,
  },
  {
    key: "crypto",
    label: "Crypto",
    battle: (process.env.CRYPTO_BATTLE ?? "0xf22F98fACbF7e1020F6EF6B386dF17d57C82827C") as Address,
    relay: (process.env.CRYPTO_RELAY ?? "0xbe1DCb3FBfDefd0962801a77e534C97F6468e4af") as Address,
    assets: CRYPTO,
    priceSource: "coingecko",
    always247: true,
  },
];

// Testnet RPC drops out and gas estimation lowballs during instability —
// hard lessons from deployments.md. Always send with explicit gas.
// 400k was tight: postReports (5 signed reports) now needs ~421k once the
// chain's L1 calldata gas (~296k) is added to L2 execution (~126k), so it was
// mined OOG right at the cap. The limit is a ceiling, not a charge (unused gas
// isn't billed on this chain), so give generous headroom for the heaviest tx.
export const GAS_LIMIT = 1_500_000n;
export const KEEPER_INTERVAL_MS = 60_000;
export const POLL_INTERVAL_MS = 2_500; // tighter so the bell is noticed fast
