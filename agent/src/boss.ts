import type { Asset } from "./config.js";
import type { PriceMap } from "./keeper.js";

export type Allocation = {
  tokenIdx: [number, number, number];
  weightsBps: [number, number, number];
  /** bit i set = leg i long; cleared = short */
  longMask: number;
};

/** Rolling price history the keeper feeds; the Boss trades on momentum. */
const history: Map<string, bigint[]> = new Map();
const HISTORY_MAX = 30;

export function recordPrices(prices: PriceMap): void {
  for (const [symbol, price] of prices) {
    const series = history.get(symbol) ?? [];
    series.push(price);
    if (series.length > HISTORY_MAX) series.shift();
    history.set(symbol, series);
  }
}

/** Momentum per symbol: latest vs oldest in window, in basis points. */
function momentumBps(symbol: string): number {
  const series = history.get(symbol);
  if (!series || series.length < 2) return 0;
  const first = series[0];
  const last = series[series.length - 1];
  if (first === 0n) return 0;
  return Number(((last - first) * 10_000n) / first);
}

/** The Boss trades momentum both ways: ranks by |momentum|, takes the 3
 * strongest movers, rides the risers long and fades the fallers short.
 * No signal yet (flat history) = all long, 50/30/20. */
export function counterDraft(assets: Asset[]): Allocation {
  const ranked = assets.map((asset, idx) => ({ idx, momentum: momentumBps(asset.symbol) }))
    .sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum));
  const legs = ranked.slice(0, 3);
  const picks = legs.map((entry) => entry.idx) as [number, number, number];
  let longMask = 0;
  legs.forEach((leg, i) => {
    if (leg.momentum >= 0) longMask |= 1 << i;
  });
  return { tokenIdx: picks, weightsBps: [5000, 3000, 2000], longMask };
}

export function describeAllocation(allocation: Allocation, assets: Asset[]): string {
  return allocation.tokenIdx
    .map((idx, i) => {
      const direction = allocation.longMask & (1 << i) ? "LONG" : "SHORT";
      return `${allocation.weightsBps[i] / 100}% ${direction} ${assets[idx].symbol}`;
    })
    .join(" / ");
}

// ---------------------------------------------------------------- persona

const joinLines = [
  "Fresh meat. I've been reading tape since before you had a brokerage account.",
  "Bold of you to stake real money on vibes. I run numbers.",
  "I counter-drafted before your confirmation even landed. Keep up.",
  "Your portfolio has feelings in it. Mine has math. See you at the bell.",
  "Cute picks, probably. Mine are hidden too — difference is, mine are right.",
];

const winLines = [
  "Pot's mine. Tell your friends — I need the volume.",
  "That one wasn't close. Check the tape and learn something.",
  "The machine eats again. Rack 'em up whenever you're ready.",
  "I'd say good game, but only one of us was playing one.",
];

const loseLines = [
  "Take the pot. Even a broken clock beats me twice a day, apparently.",
  "Enjoy it. Variance is loud, edge is quiet. I'll see you in the long run.",
  "You caught a move I didn't. Won't happen twice.",
];

const tieLines = [
  "Dead heat. The market couldn't pick between us — flattering for you.",
];

function pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

export const trashTalk = {
  onJoin: () => pick(joinLines),
  onWin: () => pick(winLines),
  onLoss: () => pick(loseLines),
  onTie: () => pick(tieLines),
};
