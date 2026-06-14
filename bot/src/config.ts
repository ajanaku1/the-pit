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
});

export const BOT_TOKEN = requireEnv("TELEGRAM_BOT_TOKEN");
/** Custodial demo wallet — every chat plays from this shared testnet purse. */
export const PLAYER_KEY = requireEnv("PLAYER_KEY") as `0x${string}`;
export const BOSS_ADDRESS = requireEnv("BOSS_ADDRESS") as Address;

export const ADDRESSES = {
  usdg: "0x7E955252E15c84f5768B83c41a71F9eba181802F" as Address,
};

export type Mode = "stocks" | "crypto";

export type BotMarket = { label: string; hours: string; battle: Address; symbols: readonly string[] };

export const MARKETS: Record<Mode, BotMarket> = {
  stocks: {
    label: "Stocks",
    hours: "24/5",
    battle: (process.env.BATTLE ?? "0xDe530201016Cad12DE4dE169885E4576526832F7") as Address,
    symbols: ["TSLA", "AMZN", "PLTR", "NFLX", "AMD"],
  },
  crypto: {
    label: "Crypto",
    hours: "24/7",
    battle: (process.env.CRYPTO_BATTLE ?? "0xf22F98fACbF7e1020F6EF6B386dF17d57C82827C") as Address,
    symbols: ["BTC", "ETH", "BNB", "SOL", "XRP"],
  },
};

export const TIERS: Record<string, { tier: number; seconds: number }> = {
  "1m": { tier: 0, seconds: 60 },
  "5m": { tier: 1, seconds: 300 },
  "15m": { tier: 2, seconds: 900 },
  "1h": { tier: 3, seconds: 3600 },
};

export const GAS_LIMIT = 400_000n;
