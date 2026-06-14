import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { battleAbi, publicClient, relayAbi } from "./chain";
import type { Market } from "./markets";

export type Prices = Record<string, { price: number; changePct: number }>;

/** Read each asset's price from the market's relay (works for stocks AND
 * crypto — the keeper posts both). Tracks % change since first sighting. */
export function usePrices(market: Market, intervalMs = 15_000): Prices {
  const [prices, setPrices] = useState<Prices>({});
  const baselines = useRef<Record<string, number>>({});

  useEffect(() => {
    // Reset baselines when the market changes so change% is per-market.
    baselines.current = {};
    setPrices({});
    let alive = true;

    async function fetchAll() {
      const next: Prices = {};
      for (const asset of market.assets) {
        try {
          const [raw] = await publicClient.readContract({
            address: market.relay, abi: relayAbi, functionName: "getPrice", args: [asset.address],
          });
          const price = Number(raw) / 1e18;
          const key = `${market.key}:${asset.symbol}`;
          if (!baselines.current[key]) baselines.current[key] = price;
          next[asset.symbol] = { price, changePct: ((price - baselines.current[key]) / baselines.current[key]) * 100 };
        } catch {
          // no price yet / transient RPC — keep last known
        }
      }
      if (alive && Object.keys(next).length) setPrices((prev) => ({ ...prev, ...next }));
    }

    void fetchAll();
    const id = setInterval(fetchAll, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [market, intervalMs]);

  return prices;
}

export type Scoreboard = { humans: number; machine: number; draws: number };

export function useScoreboard(market: Market, intervalMs = 20_000): Scoreboard {
  const [score, setScore] = useState<Scoreboard>({ humans: 0, machine: 0, draws: 0 });
  useEffect(() => {
    async function fetchScore() {
      try {
        const [humans, machine, draws] = await Promise.all([
          publicClient.readContract({ address: market.battle, abi: battleAbi, functionName: "humanWins" }),
          publicClient.readContract({ address: market.battle, abi: battleAbi, functionName: "machineWins" }),
          publicClient.readContract({ address: market.battle, abi: battleAbi, functionName: "drawCount" }),
        ]);
        setScore({ humans: Number(humans), machine: Number(machine), draws: Number(draws) });
      } catch { /* transient */ }
    }
    void fetchScore();
    const id = setInterval(fetchScore, intervalMs);
    return () => clearInterval(id);
  }, [market, intervalMs]);
  return score;
}

export function useMarketOpen(market: Market): boolean {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    async function check() {
      try {
        setOpen(await publicClient.readContract({ address: market.relay, abi: relayAbi, functionName: "isMarketOpen" }));
      } catch { /* transient */ }
    }
    void check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [market]);
  return open;
}

export type HandView = {
  tokenIdx: readonly number[];
  weightsBps: readonly number[];
  longMask: number;
  revealed: boolean;
};

export type RoundView = {
  id: bigint;
  status: number;
  stake: bigint;
  endTime: number;
  snapshotTime: number;
  creator: Address;
  creatorReturn: bigint;
  opponentReturn: bigint;
  startPrices: readonly bigint[];
  creatorHand: HandView;
  opponentHand: HandView;
};

export function useRound(market: Market, roundId: bigint | null, intervalMs = 4_000): RoundView | null {
  const [round, setRound] = useState<RoundView | null>(null);
  const refresh = useCallback(async () => {
    if (roundId === null) return;
    try {
      const data = await publicClient.readContract({
        address: market.battle, abi: battleAbi, functionName: "getRound", args: [roundId],
      });
      const toHand = (h: typeof data.creatorHand): HandView => ({
        tokenIdx: h.tokenIdx.map(Number),
        weightsBps: h.weightsBps.map(Number),
        longMask: Number(h.longMask),
        revealed: h.revealed,
      });
      setRound({
        id: roundId,
        status: data.status,
        stake: data.stake,
        endTime: Number(data.endTime),
        snapshotTime: Number(data.snapshotTime),
        creator: data.creator,
        creatorReturn: data.creatorReturn,
        opponentReturn: data.opponentReturn,
        startPrices: data.startPrices,
        creatorHand: toHand(data.creatorHand),
        opponentHand: toHand(data.opponentHand),
      });
    } catch { /* transient */ }
  }, [market, roundId]);

  useEffect(() => {
    if (roundId === null) { setRound(null); return; }
    void refresh();
    const id = setInterval(refresh, intervalMs);
    // RPC blips can starve the poll mid-round — refetch on focus so the page
    // never stays frozen on a stale phase.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [roundId, refresh, intervalMs]);

  return round;
}

export type LiveLeg = { symbol: string; weightPct: number; isLong: boolean; legReturnPct: number };
export type LivePnl = { legs: LiveLeg[]; totalPct: number };

/** Live estimate of the player's sealed hand during a running round:
 * current relay price vs on-chain start price, short legs inverted. */
export function useLivePnl(
  market: Market,
  active: boolean,
  startPrices: readonly bigint[] | undefined,
  tokenIdx: readonly number[] | undefined,
  weightsBps: readonly number[] | undefined,
  longMask: number | undefined,
  intervalMs = 6_000,
): LivePnl | null {
  const [pnl, setPnl] = useState<LivePnl | null>(null);

  useEffect(() => {
    if (!active || !startPrices || !tokenIdx || !weightsBps || longMask === undefined) {
      setPnl(null);
      return;
    }
    let alive = true;
    async function compute() {
      try {
        const legs: LiveLeg[] = [];
        let total = 0;
        for (let i = 0; i < tokenIdx!.length; i++) {
          const idx = tokenIdx![i];
          const [raw] = await publicClient.readContract({
            address: market.relay, abi: relayAbi, functionName: "getPrice", args: [market.assets[idx].address],
          });
          const now = Number(raw);
          const start = Number(startPrices![idx]);
          const isLong = (longMask! & (1 << i)) !== 0;
          let ratio = start > 0 ? now / start : 1;
          if (!isLong) ratio = Math.max(0, 2 - ratio);
          legs.push({ symbol: market.assets[idx].symbol, weightPct: weightsBps![i] / 100, isLong, legReturnPct: (ratio - 1) * 100 });
          total += ratio * (weightsBps![i] / 10_000);
        }
        if (alive) setPnl({ legs, totalPct: (total - 1) * 100 });
      } catch { /* transient — keep last estimate */ }
    }
    void compute();
    const id = setInterval(compute, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [market, active, startPrices, tokenIdx, weightsBps, longMask, intervalMs]);

  return pnl;
}
