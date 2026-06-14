import { Bot } from "grammy";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parseUnits, formatUnits, type Address } from "viem";
import { BOT_TOKEN, BOSS_ADDRESS, ADDRESSES, MARKETS, TIERS, type Mode } from "./config.js";
import { battleAbi, erc20Abi, playerAccount, publicClient, readRound, sendTx } from "./chain.js";

type ChatRound = {
  chatId: number;
  mode: Mode;
  battle: Address;
  roundId: string;
  tokenIdx: [number, number, number];
  weightsBps: [number, number, number];
  longMask: number;
  salt: `0x${string}`;
  seconds: number;
  revealed: boolean;
  notified: boolean;
};

type BotState = { rounds: ChatRound[]; modes: Record<number, Mode> };
const STATE_FILE = new URL("../state.json", import.meta.url).pathname;
const state: BotState = existsSync(STATE_FILE)
  ? (JSON.parse(readFileSync(STATE_FILE, "utf8")) as BotState)
  : { rounds: [], modes: {} };
state.modes ??= {};
const save = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

const chatMode = (chatId: number): Mode => state.modes[chatId] ?? "stocks";

/** Pending tier/stake choices per chat, before the draft lands. */
const pendingBattles = new Map<number, { tier: number; seconds: number; stake: bigint }>();

const bot = new Bot(BOT_TOKEN);

function help(mode: Mode): string {
  const market = MARKETS[mode];
  return `*Welcome to The Pit.*
You vs. an AI fund manager, real stakes, hidden hands.

Current pit: *${market.label}* (${market.hours}). Switch with /mode crypto or /mode stocks.

/battle <1m|5m|15m|1h> <stake> — call out the Boss (stake in USDG, e.g. /battle 1m 25)
/draft <w1> <SYM1> <w2> <SYM2> <w3> <SYM3> — split 100% across 3 of: ${market.symbols.join(", ")}
   prefix a ticker with - to short it
   e.g. /draft 50 ${market.symbols[0]} 30 -${market.symbols[1]} 20 ${market.symbols[2]}
/mode <stocks|crypto> — pick your arena
/status — your live round
/score — Humans vs. The Machine

Picks stay hidden (commit-reveal) until the bell. Best return takes the pot.`;
}

bot.command("start", (ctx) => ctx.reply(help(chatMode(ctx.chat.id)), { parse_mode: "Markdown" }));
bot.command("help", (ctx) => ctx.reply(help(chatMode(ctx.chat.id)), { parse_mode: "Markdown" }));

bot.command("mode", (ctx) => {
  const arg = (ctx.match ?? "").trim().toLowerCase();
  if (arg !== "stocks" && arg !== "crypto") {
    return ctx.reply("Usage: /mode stocks  or  /mode crypto");
  }
  state.modes[ctx.chat.id] = arg;
  save();
  const market = MARKETS[arg];
  return ctx.reply(`Now in the *${market.label}* pit (${market.hours}). Assets: ${market.symbols.join(", ")}.`, { parse_mode: "Markdown" });
});

bot.command("battle", async (ctx) => {
  const [tierArg, stakeArg] = (ctx.match ?? "").trim().split(/\s+/);
  const tier = TIERS[tierArg];
  const stake = stakeArg ? parseUnits(stakeArg, 6) : 0n;
  if (!tier || stake <= 0n) {
    return ctx.reply("Usage: /battle <1m|5m|15m|1h> <stake>  — e.g. /battle 1m 25");
  }
  const purse = await publicClient.readContract({
    address: ADDRESSES.usdg, abi: erc20Abi, functionName: "balanceOf", args: [playerAccount.address],
  });
  if (purse < stake) {
    return ctx.reply(`The house purse only holds ${formatUnits(purse, 6)} USDG right now. Stake less.`);
  }
  pendingBattles.set(ctx.chat.id, { tier: tier.tier, seconds: tier.seconds, stake });
  const market = MARKETS[chatMode(ctx.chat.id)];
  return ctx.reply(
    `${tierArg} ${market.label} round, ${stakeArg} USDG on the line. Now draft your book:\n` +
    `/draft <w1> <SYM1> <w2> <SYM2> <w3> <SYM3>\ne.g. /draft 50 ${market.symbols[0]} 30 -${market.symbols[1]} 20 ${market.symbols[2]}`,
  );
});

type ParsedDraft = {
  tokenIdx: [number, number, number];
  weightsBps: [number, number, number];
  longMask: number;
};

function parseDraft(input: string, symbols: readonly string[]): ParsedDraft | null {
  const parts = input.trim().toUpperCase().split(/\s+/);
  if (parts.length !== 6) return null;
  const tokenIdx: number[] = [];
  const weightsBps: number[] = [];
  let longMask = 0;
  for (let i = 0; i < 6; i += 2) {
    const weight = Number(parts[i]);
    let symbol = parts[i + 1];
    const isShort = symbol.startsWith("-") || symbol.startsWith("SHORT:");
    if (isShort) symbol = symbol.replace(/^-|^SHORT:/, "");
    const idx = symbols.indexOf(symbol);
    if (!Number.isInteger(weight) || weight <= 0 || idx === -1) return null;
    if (!isShort) longMask |= 1 << tokenIdx.length;
    weightsBps.push(weight * 100);
    tokenIdx.push(idx);
  }
  if (new Set(tokenIdx).size !== 3) return null;
  if (weightsBps.reduce((a, b) => a + b, 0) !== 10_000) return null;
  return {
    tokenIdx: tokenIdx as [number, number, number],
    weightsBps: weightsBps as [number, number, number],
    longMask,
  };
}

bot.command("draft", async (ctx) => {
  const pending = pendingBattles.get(ctx.chat.id);
  if (!pending) return ctx.reply("Open a round first: /battle <1m|5m|15m|1h> <stake>");
  const mode = chatMode(ctx.chat.id);
  const market = MARKETS[mode];
  const draft = parseDraft(ctx.match ?? "", market.symbols);
  if (!draft) {
    return ctx.reply(`That book doesn't parse. Three different ${market.label.toLowerCase()} tickers, weights summing to 100.\ne.g. /draft 50 ${market.symbols[0]} 30 ${market.symbols[1]} 20 ${market.symbols[2]}`);
  }

  await ctx.replyWithChatAction("typing");
  const roundId = await publicClient.readContract({
    address: market.battle, abi: battleAbi, functionName: "nextRoundId",
  });
  const salt = `0x${randomBytes(32).toString("hex")}` as `0x${string}`;
  const commit = await publicClient.readContract({
    address: market.battle,
    abi: battleAbi,
    functionName: "commitHash",
    args: [roundId, playerAccount.address, draft.tokenIdx, draft.weightsBps, draft.longMask, salt],
  });

  try {
    await sendTx({ address: ADDRESSES.usdg, abi: erc20Abi, functionName: "approve", args: [market.battle, pending.stake] });
    await sendTx({
      address: market.battle,
      abi: battleAbi,
      functionName: "createRound",
      args: [pending.tier, pending.stake, commit, BOSS_ADDRESS],
    });
  } catch (error) {
    return ctx.reply(`Couldn't open the round: ${(error as Error).message.slice(0, 120)}`);
  }

  state.rounds.push({
    chatId: ctx.chat.id,
    mode,
    battle: market.battle,
    roundId: roundId.toString(),
    ...draft,
    salt,
    seconds: pending.seconds,
    revealed: false,
    notified: false,
  });
  save();
  pendingBattles.delete(ctx.chat.id);
  return ctx.reply(
    `${market.label} round ${roundId} is live. Your book is sealed — the Boss can't see it, and you can't see his.\n` +
    `The bell rings ${pending.seconds >= 60 ? pending.seconds / 60 : pending.seconds}${pending.seconds >= 60 ? "m" : "s"} after he steps in. I'll handle the reveal.`,
  );
});

bot.command("status", async (ctx) => {
  const mine = state.rounds.filter((r) => r.chatId === ctx.chat.id).at(-1);
  if (!mine) return ctx.reply("No rounds yet. /battle to call out the Boss.");
  const round = await readRound(mine.battle, BigInt(mine.roundId));
  const labels = ["?", "waiting for the Boss", "live — clock running", "bell rung, reveals open", "settled", "cancelled"];
  return ctx.reply(`${MARKETS[mine.mode].label} round ${mine.roundId}: ${labels[round.status] ?? "?"}\nStake: ${formatUnits(round.stake, 6)} USDG each side.`);
});

bot.command("score", async (ctx) => {
  const market = MARKETS[chatMode(ctx.chat.id)];
  const [humans, machine, draws] = await Promise.all([
    publicClient.readContract({ address: market.battle, abi: battleAbi, functionName: "humanWins" }),
    publicClient.readContract({ address: market.battle, abi: battleAbi, functionName: "machineWins" }),
    publicClient.readContract({ address: market.battle, abi: battleAbi, functionName: "drawCount" }),
  ]);
  return ctx.reply(`*Humans vs. The Machine* — ${market.label} pit\nHumans ${humans} — ${machine} Machine (${draws} draws)`, { parse_mode: "Markdown" });
});

/** Background loop: auto-reveal once the round is live, announce settlements
 * (every round gets an alert; >=15m rounds are the ones players walk away from). */
async function poll(): Promise<void> {
  for (const tracked of state.rounds) {
    if (tracked.notified) continue;
    try {
      const roundId = BigInt(tracked.roundId);
      const round = await readRound(tracked.battle, roundId);

      // Reveal-at-start: declare as soon as the round is live (status 2) so
      // both hands are public for the duration; fall back to Snapshotted (3).
      if ((round.status === 2 || round.status === 3) && !tracked.revealed) {
        await sendTx({
          address: tracked.battle,
          abi: battleAbi,
          functionName: "reveal",
          args: [roundId, tracked.tokenIdx, tracked.weightsBps, tracked.longMask, tracked.salt],
        });
        tracked.revealed = true;
        save();
        await bot.api.sendMessage(tracked.chatId, `${MARKETS[tracked.mode].label} round ${tracked.roundId}: your book is on the table — watch it race.`);
      } else if (round.status === 4) {
        const youAreCreator = round.creator.toLowerCase() === playerAccount.address.toLowerCase();
        const yours = youAreCreator ? round.creatorReturn : round.opponentReturn;
        const his = youAreCreator ? round.opponentReturn : round.creatorReturn;
        const pct = (value: bigint) => `${(Number(value) / 1e16 - 100).toFixed(2)}%`;
        let verdict: string;
        if (yours > his) verdict = `You took the pot. ${pct(yours)} vs ${pct(his)}. The Machine will remember this.`;
        else if (his > yours) verdict = `The Boss cleaned you out. ${pct(his)} vs ${pct(yours)}. Run it back?`;
        else verdict = `Dead heat — stakes returned. ${pct(yours)} apiece.`;
        await bot.api.sendMessage(tracked.chatId, `${MARKETS[tracked.mode].label} round ${tracked.roundId} settled. ${verdict}`);
        tracked.notified = true;
        save();
      } else if (round.status === 5) {
        await bot.api.sendMessage(tracked.chatId, `Round ${tracked.roundId} was cancelled — stake returned.`);
        tracked.notified = true;
        save();
      }
    } catch (error) {
      console.error(`[poll round ${tracked.roundId}]`, (error as Error).message?.slice(0, 120));
    }
  }
}

bot.catch((err) => console.error("[bot]", err.message));

setInterval(() => void poll(), 7_000);
void bot.start({ onStart: () => console.log(`Pit bot up as custodial player ${playerAccount.address}`) });
