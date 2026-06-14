import { encodeAbiParameters, type Address } from "viem";
import { ADDRESSES, CRYPTO_FEEDS, type Market } from "./config.js";
import { relayAbi, routerAbi } from "./abi.js";
import { account, publicClient, sendTx, withRetry } from "./chain.js";

const reportType = {
  type: "tuple",
  components: [
    { name: "token", type: "address" },
    { name: "price", type: "uint192" },
    { name: "observationsTimestamp", type: "uint32" },
    { name: "marketOpen", type: "bool" },
  ],
} as const;

/** 24/5 US equities: Robinhood trades Sun 8pm ET–Fri 8pm ET, which in UTC
 * (EDT, UTC-4) is Mon 00:00–Sat 00:00. Closed on UTC Saturday and Sunday.
 * FORCE_MARKET_OPEN=true overrides for weekend demos/testing — the on-chain
 * guard still enforces whatever status we sign, this only changes what we sign. */
export function isMarketOpenNow(now = new Date()): boolean {
  if (process.env.FORCE_MARKET_OPEN === "true") return true;
  const day = now.getUTCDay();
  return day !== 0 && day !== 6;
}

export type PriceMap = Map<string, bigint>; // symbol -> 18-decimal USD price

/** Quote all stock assets on the SwapRouter (USDG 6dp -> scale to 1e18). */
async function fetchRouterPrices(market: Market): Promise<PriceMap> {
  const prices: PriceMap = new Map();
  for (const asset of market.assets) {
    const usdgOut = await publicClient.readContract({
      address: ADDRESSES.router,
      abi: routerAbi,
      functionName: "quoteTokenForUSDG",
      args: [asset.address, 10n ** 18n],
    });
    prices.set(asset.symbol, usdgOut * 10n ** 12n);
  }
  return prices;
}

/** Pyth Network price-feed IDs (USD). Pyth's Hermes service is a global oracle
 *  CDN: no API key, and not geo-blocked the way exchange APIs (Binance/KuCoin)
 *  are from US datacenters. */
const PYTH_FEEDS: Record<string, string> = {
  BTC: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  BNB: "2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
  SOL: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  XRP: "ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8",
};

/** Live crypto prices via Pyth Hermes (no key, datacenter-friendly, covers all
 *  five). Falls back to CoinGecko, then Binance. 18-decimal USD. */
async function fetchCryptoPrices(market: Market): Promise<PriceMap> {
  try {
    const ids = market.assets.map((a) => `ids[]=${PYTH_FEEDS[a.symbol]}`).join("&");
    const res = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?${ids}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) throw new Error(`pyth ${res.status}`);
    const body = (await res.json()) as { parsed: { id: string; price: { price: string; expo: number } }[] };
    const byId = new Map(body.parsed.map((p) => [p.id.toLowerCase(), p.price]));
    const prices: PriceMap = new Map();
    for (const asset of market.assets) {
      const p = byId.get(PYTH_FEEDS[asset.symbol].toLowerCase());
      if (!p) throw new Error(`pyth missing ${asset.symbol}`);
      prices.set(asset.symbol, toWad(Number(p.price) * 10 ** p.expo));
    }
    return prices;
  } catch {
    return fetchCoingeckoPrices(market);
  }
}

/** CoinGecko fallback (often rate-limited from shared datacenter IPs). */
async function fetchCoingeckoPrices(market: Market): Promise<PriceMap> {
  const ids = market.assets.map((a) => CRYPTO_FEEDS[a.symbol].coingecko).join(",");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const data = (await res.json()) as Record<string, { usd: number }>;
    const prices: PriceMap = new Map();
    for (const asset of market.assets) {
      const usd = data[CRYPTO_FEEDS[asset.symbol].coingecko]?.usd;
      if (usd === undefined) throw new Error(`coingecko missing ${asset.symbol}`);
      prices.set(asset.symbol, toWad(usd));
    }
    return prices;
  } catch {
    return fetchBinancePrices(market);
  }
}

async function fetchBinancePrices(market: Market): Promise<PriceMap> {
  const symbols = market.assets.map((a) => `"${CRYPTO_FEEDS[a.symbol].binance}"`).join(",");
  const res = await fetch(
    `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(`[${symbols}]`)}`,
    { signal: AbortSignal.timeout(12_000) },
  );
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const data = (await res.json()) as { symbol: string; price: string }[];
  const bySymbol = new Map(data.map((d) => [d.symbol, d.price]));
  const prices: PriceMap = new Map();
  for (const asset of market.assets) {
    const price = bySymbol.get(CRYPTO_FEEDS[asset.symbol].binance);
    if (price === undefined) throw new Error(`binance missing ${asset.symbol}`);
    prices.set(asset.symbol, toWad(Number(price)));
  }
  return prices;
}

/** Float USD -> 18-decimal bigint without precision loss on cents. */
function toWad(usd: number): bigint {
  return BigInt(Math.round(usd * 1e6)) * 10n ** 12n;
}

function fetchPrices(market: Market): Promise<PriceMap> {
  return market.priceSource === "coingecko" ? fetchCryptoPrices(market) : fetchRouterPrices(market);
}

async function signReport(relay: Address, token: Address, price: bigint, observedAt: number, marketOpen: boolean) {
  const report = { token, price, observationsTimestamp: observedAt, marketOpen };
  const digest = await publicClient.readContract({
    address: relay,
    abi: relayAbi,
    functionName: "reportDigest",
    args: [report],
  });
  const signature = await account.sign({ hash: digest });
  return encodeAbiParameters([reportType, { type: "bytes" }], [report, signature]);
}

// The relay rejects any report whose timestamp <= the last stored one
// (StaleReport). Two posts to the same relay — the routine keeper and a
// snapshot-time post — must not interleave: the timestamp is allocated, the
// report signed (async), and the tx sent as one atomic unit, or a
// lower-timestamp post can land after a higher one. Serialize per relay.
const lastObservedAt = new Map<string, number>();
const relayLocks = new Map<string, Promise<unknown>>();

function nextTimestamp(relay: Address): number {
  const now = Math.floor(Date.now() / 1000);
  const next = Math.max(now, (lastObservedAt.get(relay) ?? 0) + 1);
  lastObservedAt.set(relay, next);
  return next;
}

/** Run `fn` after any in-flight post to the same relay completes. */
function withRelayLock<T>(relay: Address, fn: () => Promise<T>): Promise<T> {
  const prev = relayLocks.get(relay) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  relayLocks.set(relay, next.catch(() => undefined));
  return next;
}

/** Quote, sign, and post one report per asset for a market. Returns the prices.
 * Timestamp-allocate → sign → send is serialized per relay (and re-signed on
 * each retry with a fresh strictly-increasing timestamp), so concurrent posts
 * can never land out of order and trip StaleReport. */
export async function postPrices(market: Market): Promise<PriceMap> {
  const prices = await withRetry(`fetchPrices:${market.key}`, () => fetchPrices(market));
  const marketOpen = market.always247 ? true : isMarketOpenNow();

  let observedAt = 0;
  await withRelayLock(market.relay, () =>
    withRetry(`postReports:${market.key}`, async () => {
      observedAt = nextTimestamp(market.relay);
      const reports: `0x${string}`[] = [];
      for (const asset of market.assets) {
        reports.push(await signReport(market.relay, asset.address, prices.get(asset.symbol)!, observedAt, marketOpen));
      }
      return sendTx({ address: market.relay, abi: relayAbi, functionName: "postReports", args: [reports] });
    }),
  );
  console.log(
    `[keeper:${market.key}] posted ${market.assets.length} prices @ ${new Date(observedAt * 1000).toISOString()} market=${marketOpen ? "open" : "closed"}`,
  );
  return prices;
}
