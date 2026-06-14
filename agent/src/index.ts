import { randomBytes } from "node:crypto";
import { formatUnits } from "viem";
import { ADDRESSES, KEEPER_INTERVAL_MS, MARKETS, POLL_INTERVAL_MS, type Market } from "./config.js";
import { battleAbi, erc20Abi, stockAbi } from "./abi.js";
import { account, publicClient, sendTx, withRetry } from "./chain.js";
import { postPrices } from "./keeper.js";
import { counterDraft, describeAllocation, recordPrices, trashTalk } from "./boss.js";
import { commitKey, getCommitment, markRevealed, saveCommitment } from "./state.js";

const Status = { Open: 1, Running: 2, Snapshotted: 3, Settled: 4, Cancelled: 5 } as const;
const ZERO = "0x0000000000000000000000000000000000000000";

/** Hook for surfaces (Telegram bot, web) to receive Boss commentary. */
export type Announcer = (message: string) => void;
let announce: Announcer = (message) => console.log(`[boss] ${message}`);
export function setAnnouncer(fn: Announcer): void {
  announce = fn;
}

function readRound(market: Market, roundId: bigint) {
  return publicClient.readContract({
    address: market.battle, abi: battleAbi, functionName: "getRound", args: [roundId],
  });
}

async function joinAsBoss(market: Market, roundId: bigint): Promise<void> {
  const allocation = counterDraft(market.assets);
  const salt = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  const commit = await publicClient.readContract({
    address: market.battle,
    abi: battleAbi,
    functionName: "commitHash",
    args: [roundId, account.address, allocation.tokenIdx, allocation.weightsBps, allocation.longMask, salt],
  });

  // Persist BEFORE committing on-chain: a lost salt is a forfeited stake.
  saveCommitment({ key: commitKey(market.key, roundId), allocation, salt, revealed: false });

  const round = await readRound(market, roundId);
  await withRetry("approve", () =>
    sendTx({ address: ADDRESSES.usdg, abi: erc20Abi, functionName: "approve", args: [market.battle, round.stake] }),
  );
  await withRetry("joinRound", () =>
    sendTx({ address: market.battle, abi: battleAbi, functionName: "joinRound", args: [roundId, commit] }),
  );
  announce(`[${market.label}] Round ${roundId}: I'm in. ${trashTalk.onJoin()}`);

  // Reveal-at-start: declare the hand immediately so the human can watch
  // both portfolios race live. If this leg fails, the tick loop retries it.
  await revealAsBoss(market, roundId).catch(() => undefined);
}

/** Is the boss's own hand already revealed on-chain for this round? */
function bossRevealed(round: { creator: string; creatorHand: { revealed: boolean }; opponentHand: { revealed: boolean } }): boolean {
  const bossIsCreator = round.creator.toLowerCase() === account.address.toLowerCase();
  return bossIsCreator ? round.creatorHand.revealed : round.opponentHand.revealed;
}

/** v4 one-shot close: post a price observed at/after the bell, then settle in
 * the same pass (settle reads the fresh price, computes, and pays — no separate
 * snapshot tx, no inter-tick gap). */
async function postAndSettle(market: Market, roundId: bigint): Promise<void> {
  await postPrices(market).then(recordPrices);
  await settleRound(market, roundId);
}

async function revealAsBoss(market: Market, roundId: bigint): Promise<void> {
  const commitment = getCommitment(commitKey(market.key, roundId));
  if (!commitment || commitment.revealed) return;
  await withRetry("reveal", () =>
    sendTx({
      address: market.battle,
      abi: battleAbi,
      functionName: "reveal",
      args: [roundId, commitment.allocation.tokenIdx, commitment.allocation.weightsBps, commitment.allocation.longMask, commitment.salt],
    }),
  );
  markRevealed(commitKey(market.key, roundId));
  announce(`[${market.label}] Round ${roundId}: cards on the table — ${describeAllocation(commitment.allocation, market.assets)}.`);
}

async function settleRound(market: Market, roundId: bigint): Promise<void> {
  await withRetry("settle", () =>
    sendTx({ address: market.battle, abi: battleAbi, functionName: "settle", args: [roundId] }),
  );
  const round = await readRound(market, roundId);
  const bossIsCreator = round.creator.toLowerCase() === account.address.toLowerCase();
  const bossReturn = bossIsCreator ? round.creatorReturn : round.opponentReturn;
  const humanReturn = bossIsCreator ? round.opponentReturn : round.creatorReturn;
  if (bossReturn > humanReturn) announce(`[${market.label}] Round ${roundId}: settled. ${trashTalk.onWin()}`);
  else if (humanReturn > bossReturn) announce(`[${market.label}] Round ${roundId}: settled. ${trashTalk.onLoss()}`);
  else announce(`[${market.label}] Round ${roundId}: settled. ${trashTalk.onTie()}`);
}

/** Composite keys "<market>:<roundId>" that reached a terminal state. */
const terminalRounds = new Set<string>();

/** One pass over every round in one market that might need the Boss to act. */
async function tickMarket(market: Market): Promise<void> {
  const nextRoundId = await publicClient.readContract({
    address: market.battle, abi: battleAbi, functionName: "nextRoundId",
  });
  const now = Math.floor(Date.now() / 1000);

  for (let roundId = 1n; roundId < nextRoundId; roundId++) {
    const key = commitKey(market.key, roundId);
    if (terminalRounds.has(key)) continue;
    const round = await readRound(market, roundId);
    if (round.status === Status.Settled || round.status === Status.Cancelled) {
      terminalRounds.add(key);
      continue;
    }
    const bossInvolved =
      round.creator.toLowerCase() === account.address.toLowerCase() ||
      round.opponent.toLowerCase() === account.address.toLowerCase() ||
      round.opponent === ZERO;

    if (round.status === Status.Open && !bossInvolved) continue;

    try {
      if (round.status === Status.Open && round.creator.toLowerCase() !== account.address.toLowerCase()) {
        if (now <= Number(round.createdAt) + 9 * 60) await joinAsBoss(market, roundId);
      } else if (round.status === Status.Running) {
        // Reveal as soon as we're live (safety net if join-time reveal missed).
        if (!bossRevealed(round)) await revealAsBoss(market, roundId);
        if (now >= Number(round.endTime) + 1) {
          // Both revealed → settle the instant the bell rings; otherwise wait
          // out the on-chain forfeit grace (REVEAL_GRACE = 45s) for a slow human.
          const bothRevealed = round.creatorHand.revealed && round.opponentHand.revealed;
          const graceOver = now > Number(round.endTime) + 45;
          if (bothRevealed || graceOver) await postAndSettle(market, roundId);
        }
      }
    } catch (error) {
      console.error(`[${market.key} round ${roundId}] ${(error as Error).message?.slice(0, 160)}`);
    }
  }
}

async function logVault(): Promise<void> {
  const stocks = MARKETS.find((market) => market.key === "stocks");
  if (!stocks) return;
  let total = 0n;
  for (const asset of stocks.assets) {
    const [balance, multiplier] = await Promise.all([
      publicClient.readContract({ address: asset.address, abi: stockAbi, functionName: "balanceOf", args: [ADDRESSES.vault] }),
      publicClient.readContract({ address: asset.address, abi: stockAbi, functionName: "uiMultiplier" }),
    ]);
    total += (balance * multiplier) / 10n ** 18n;
  }
  console.log(`[vault] holdings (multiplier-adjusted units): ${formatUnits(total, 18)}`);
}

async function postAllPrices(): Promise<void> {
  for (const market of MARKETS) {
    await postPrices(market)
      .then(recordPrices)
      .catch((error) => console.error(`[keeper:${market.key}]`, (error as Error).message?.slice(0, 120)));
  }
}

export async function main(): Promise<void> {
  console.log(`Pit Boss online as ${account.address} — markets: ${MARKETS.map((m) => m.label).join(", ")}`);
  await postAllPrices();
  await logVault().catch(() => undefined);

  setInterval(() => void postAllPrices(), KEEPER_INTERVAL_MS);

  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      for (const market of MARKETS) await tickMarket(market);
    } catch (error) {
      console.error("[tick]", (error as Error).message?.slice(0, 160));
    } finally {
      busy = false;
    }
  }, POLL_INTERVAL_MS);
}

const isDirectRun = process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js");
if (isDirectRun) void main();
