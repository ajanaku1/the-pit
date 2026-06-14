import { useEffect, useMemo, useRef, useState } from "react";
import { parseEventLogs, parseUnits, type Address } from "viem";
import {
  ADDRESSES, GAS_LIMIT, RoundStatus, TIERS,
  battleAbi, erc20Abi, getInjectedProvider, makeWalletClient, publicClient, robinhoodTestnet,
} from "./chain";
import { MARKETS, type Market } from "./markets";
import { useLivePnl, useMarketOpen, usePrices, useRound, useScoreboard, type LivePnl } from "./usePit";

function HandBook({ title, pnl, waitingNote }: { title: string; pnl: LivePnl | null; waitingNote?: string }) {
  return (
    <div className="livebook">
      <div className="bookhead">{title}</div>
      {pnl ? pnl.legs.map((leg) => (
        <div className="leg" key={leg.symbol}>
          <span className={`dir ${leg.isLong ? "long" : "short"}`}>{leg.isLong ? "LONG" : "SHORT"}</span>
          <span className="legsym">{leg.symbol}</span>
          <span className="legw">{leg.weightPct}%</span>
          <span className={`legret ${leg.legReturnPct >= 0 ? "up" : "dn"}`}>
            {leg.legReturnPct >= 0 ? "+" : ""}{leg.legReturnPct.toFixed(2)}%
          </span>
        </div>
      )) : <div className="legnote">{waitingNote}</div>}
    </div>
  );
}

type Mode = "stocks" | "crypto";
type Draft = { picks: number[]; weights: Record<number, number>; longs: Record<number, boolean> };
type StoredRound = {
  roundId: string;
  tokenIdx: [number, number, number];
  weightsBps: [number, number, number];
  longMask: number;
  salt: `0x${string}`;
  revealed: boolean;
};

const storeKey = (mode: Mode) => `pit.round.${mode}`;

const TALK = {
  live: "I counter-drafted before your confirmation even landed. Keep up.",
  won: "Take the pot. Even a broken clock beats me twice a day, apparently.",
  lost: "That one wasn't close. Check the tape and learn something.",
  tie: "Dead heat. The market couldn't pick between us — flattering for you.",
};

function loadStored(mode: Mode): StoredRound | null {
  const raw = localStorage.getItem(storeKey(mode));
  return raw ? (JSON.parse(raw) as StoredRound) : null;
}

/** Turn raw wallet/RPC errors into something a player can act on. */
function humanizeError(err: unknown): string {
  const msg = (err as Error).message ?? String(err);
  if (/user rejected|denied|rejected the request/i.test(msg)) return "You dismissed the wallet prompt — try again when ready.";
  if (/insufficient funds|exceeds balance/i.test(msg)) return "Not enough ETH for gas or USDG for the stake.";
  if (/rpc error|network|timeout|fetch|503|429|connection/i.test(msg)) return "Testnet RPC hiccup — nothing was charged. Hit the button again.";
  return msg.split("\n")[0].slice(0, 140);
}

function retClass(value: bigint): string {
  if (value === 0n) return "hidden";
  return value >= 10n ** 18n ? "up" : "dn";
}

function bossLine(phase: string, yours: bigint, his: bigint): string {
  if (phase !== "settled") return TALK.live;
  if (yours > his) return TALK.won;
  if (yours < his) return TALK.lost;
  return TALK.tie;
}

/** Adapt decimals to magnitude: BTC ($63,664) vs XRP ($1.13). */
function fmtPrice(value: number): string {
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

const BURST: Record<string, { t: (mmss: string) => string; sub: string }> = {
  waiting: { t: () => "…", sub: "boss inbound" },
  live: { t: (mmss) => mmss, sub: "to the bell" },
  settling: { t: () => "BELL", sub: "settling…" },
  settled: { t: () => "DONE", sub: "settled" },
};

export default function App() {
  const [mode, setMode] = useState<Mode>("stocks");
  const market: Market = MARKETS[mode];

  const prices = usePrices(market);
  const score = useScoreboard(market);
  const marketOpen = useMarketOpen(market);
  const [wallet, setWallet] = useState<Address | null>(null);
  const [stored, setStored] = useState<StoredRound | null>(() => loadStored("stocks"));
  const [draft, setDraft] = useState<Draft>({ picks: [], weights: {}, longs: {} });
  const [tierIdx, setTierIdx] = useState(0);
  const [stake, setStake] = useState("25");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const round = useRound(market, stored ? BigInt(stored.roundId) : null);

  // Switching markets loads that market's own in-flight round and clears the draft.
  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setStored(loadStored(next));
    setDraft({ picks: [], weights: {}, longs: {} });
    setError(null);
    setBusy(null);
  }

  async function connect() {
    const provider = getInjectedProvider();
    if (!provider) { setError("No wallet found. Install MetaMask."); return; }
    const client = makeWalletClient(provider);
    const [address] = await client.requestAddresses();
    try {
      await client.switchChain({ id: robinhoodTestnet.id });
    } catch {
      await client.addChain({ chain: robinhoodTestnet }).catch(() => undefined);
      await client.switchChain({ id: robinhoodTestnet.id }).catch(() => undefined);
    }
    setWallet(address);
  }

  function togglePick(idx: number) {
    setDraft((prev) => {
      if (prev.picks.includes(idx)) {
        const picks = prev.picks.filter((p) => p !== idx);
        const weights = { ...prev.weights };
        const longs = { ...prev.longs };
        delete weights[idx];
        delete longs[idx];
        return { picks, weights, longs };
      }
      if (prev.picks.length >= 3) return prev;
      const picks = [...prev.picks, idx];
      const defaults = [50, 30, 20];
      return {
        picks,
        weights: { ...prev.weights, [idx]: defaults[picks.length - 1] ?? 0 },
        longs: { ...prev.longs, [idx]: true },
      };
    });
  }

  function toggleDirection(idx: number) {
    setDraft((prev) => ({ ...prev, longs: { ...prev.longs, [idx]: !prev.longs[idx] } }));
  }

  const weightTotal = draft.picks.reduce((sum, idx) => sum + (draft.weights[idx] ?? 0), 0);
  const draftReady = draft.picks.length === 3 && weightTotal === 100 && Number(stake) > 0;

  async function enterThePit() {
    if (!wallet || !draftReady) return;
    const provider = getInjectedProvider();
    if (!provider) return;
    const client = makeWalletClient(provider);
    setError(null);
    try {
      setBusy("Sealing your hand…");
      const roundId = await publicClient.readContract({
        address: market.battle, abi: battleAbi, functionName: "nextRoundId",
      });
      const tokenIdx = draft.picks.slice().sort((a, b) => a - b) as [number, number, number];
      const weightsBps = tokenIdx.map((idx) => (draft.weights[idx] ?? 0) * 100) as [number, number, number];
      const longMask = tokenIdx.reduce((mask, idx, i) => (draft.longs[idx] ? mask | (1 << i) : mask), 0);
      const saltBytes = crypto.getRandomValues(new Uint8Array(32));
      const salt = `0x${Array.from(saltBytes).map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
      const commit = await publicClient.readContract({
        address: market.battle, abi: battleAbi, functionName: "commitHash",
        args: [roundId, wallet, tokenIdx, weightsBps, longMask, salt],
      });
      const stakeUnits = parseUnits(stake, 6);

      // Approve once for a generous amount so repeat rounds skip this popup.
      const allowance = await publicClient.readContract({
        address: ADDRESSES.usdg, abi: erc20Abi, functionName: "allowance", args: [wallet, market.battle],
      });
      if (allowance < stakeUnits) {
        setBusy("Approving stake (one-time)…");
        const approveHash = await client.writeContract({
          account: wallet, chain: robinhoodTestnet,
          address: ADDRESSES.usdg, abi: erc20Abi, functionName: "approve",
          args: [market.battle, parseUnits("1000000", 6)], gas: GAS_LIMIT,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setBusy("Calling out the Boss…");
      const createHash = await client.writeContract({
        account: wallet, chain: robinhoodTestnet,
        address: market.battle, abi: battleAbi, functionName: "createRound",
        args: [TIERS[tierIdx].tier, stakeUnits, commit, ADDRESSES.boss], gas: GAS_LIMIT,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

      // The commit binds the round id we predicted. If another round landed
      // in between, our commit can never reveal — surface it immediately.
      const created = parseEventLogs({ abi: battleAbi, logs: receipt.logs, eventName: "RoundCreated" })[0];
      const actualRoundId = created ? created.args.roundId : roundId;
      if (actualRoundId !== roundId) {
        setError(`Round id raced (${roundId} → ${actualRoundId}); this round can't reveal. Don't re-stake until it refunds.`);
      }

      const record: StoredRound = { roundId: actualRoundId.toString(), tokenIdx, weightsBps, longMask, salt, revealed: false };
      localStorage.setItem(storeKey(mode), JSON.stringify(record));
      setStored(record);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setBusy(null);
    }
  }

  async function revealHand() {
    if (!wallet || !stored) return;
    const provider = getInjectedProvider();
    if (!provider) return;
    const client = makeWalletClient(provider);
    setError(null);
    try {
      setBusy("Locking your hand in…");
      const hash = await client.writeContract({
        account: wallet, chain: robinhoodTestnet,
        address: market.battle, abi: battleAbi, functionName: "reveal",
        args: [BigInt(stored.roundId), stored.tokenIdx, stored.weightsBps, stored.longMask, stored.salt], gas: GAS_LIMIT,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      const next = { ...stored, revealed: true };
      localStorage.setItem(storeKey(mode), JSON.stringify(next));
      setStored(next);
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setBusy(null);
    }
  }

  function runItBack() {
    localStorage.removeItem(storeKey(mode));
    setStored(null);
    setDraft({ picks: [], weights: {}, longs: {} });
  }

  const [clock, setClock] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setClock(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const phase = useMemo(() => {
    if (!stored || !round) return "draft";
    if (round.status === RoundStatus.Open) return "waiting";
    if (round.status === RoundStatus.Running) return "live";
    if (round.status === RoundStatus.Snapshotted) return "settling";
    if (round.status === RoundStatus.Settled) return "settled";
    return "draft";
  }, [stored, round]);

  // Live P&L stays on through the settling window so the numbers never blink
  // out to "SEALED" between the bell and the on-chain result.
  const inProgress = phase === "live" || phase === "settling";
  // Your hand is known locally (localStorage); the Boss's appears once revealed.
  const playerPnl = useLivePnl(
    market, inProgress, round?.startPrices,
    stored?.tokenIdx, stored?.weightsBps, stored?.longMask,
  );
  const bossRevealed = round?.opponentHand.revealed ?? false;
  const bossPnl = useLivePnl(
    market, inProgress && bossRevealed, round?.startPrices,
    round?.opponentHand.tokenIdx, round?.opponentHand.weightsBps, round?.opponentHand.longMask,
  );
  const youRevealed = round?.creatorHand.revealed ?? false;

  // Auto-reveal the instant the Boss joins: entering the pit was your commit,
  // so lock your hand in on-chain automatically — no dangling "reveal" step.
  // One-shot per round; if it fails, the fallback button lets you retry.
  const autoRevealedFor = useRef<string | null>(null);
  useEffect(() => {
    if (phase === "live" && stored && wallet && !youRevealed && busy === null
        && autoRevealedFor.current !== stored.roundId) {
      autoRevealedFor.current = stored.roundId;
      void revealHand();
    }
    // revealHand is stable in behavior; the ref guard prevents re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stored, wallet, youRevealed, busy]);

  const youAreCreator = round && wallet ? round.creator.toLowerCase() === wallet.toLowerCase() : true;
  const yourReturn = round ? (youAreCreator ? round.creatorReturn : round.opponentReturn) : 0n;
  const bossReturn = round ? (youAreCreator ? round.opponentReturn : round.creatorReturn) : 0n;
  const pct = (value: bigint) => (value === 0n ? "—" : `${(Number(value) / 1e16 - 100).toFixed(2)}%`);
  const secondsLeft = round ? Math.max(0, round.endTime - clock) : 0;
  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  // The bell has rung but the result isn't on-chain yet (post-snapshot or the
  // brief Running-past-endTime gap). Show motion, never a frozen screen.
  const settling = phase === "settling" || (phase === "live" && secondsLeft === 0);

  // Final verdict from the player's seat. Forfeit (you never revealed) = loss.
  type Outcome = "win" | "loss" | "draw";
  const outcome: Outcome = (() => {
    if (youRevealed && bossRevealed) {
      if (yourReturn > bossReturn) return "win";
      if (yourReturn < bossReturn) return "loss";
      return "draw";
    }
    if (youRevealed) return "win";
    if (bossRevealed) return "loss";
    return "draw";
  })();
  const stakeUsdg = round ? Number(round.stake) / 1e6 : 0;
  const RESULT: Record<Outcome, { title: string; sub: string }> = {
    win: { title: "YOU WIN", sub: `+${stakeUsdg} USDG — pot is yours` },
    loss: { title: "THE BOSS WINS", sub: `−${stakeUsdg} USDG — run it back` },
    draw: { title: "DEAD HEAT", sub: "stake returned" },
  };

  const tapeRun = (copy: number) => (
    <span key={copy}>
      {market.assets.map((asset) => {
        const quote = prices[asset.symbol];
        const up = (quote?.changePct ?? 0) >= 0;
        return (
          <span className="tape-item" key={asset.symbol}>
            {asset.symbol}{" "}
            <b className={up ? "up" : "dn"}>
              {quote ? fmtPrice(quote.price) : "…"} {up ? "▲" : "▼"}{Math.abs(quote?.changePct ?? 0).toFixed(2)}%
            </b>
          </span>
        );
      })}
      <span className="tape-item dim">{market.label.toUpperCase()} {marketOpen ? `OPEN · ${market.hours}` : "CLOSED"}</span>
      <span className="tape-item dim">HUMANS {score.humans} — {score.machine} MACHINE</span>
    </span>
  );

  return (
    <>
      <div className="tape"><div className="tape-inner">{[0, 1].map(tapeRun)}</div></div>

      <header>
        <div className="logo"><img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="logomark" />THE <em>PIT</em></div>
        <div className="modeswitch">
          {(Object.keys(MARKETS) as Mode[]).map((key) => (
            <button
              key={key}
              className={`modebtn ${key === mode ? "on" : ""}`}
              onClick={() => switchMode(key)}
            >
              {MARKETS[key].label} <span className="hrs">{MARKETS[key].hours}</span>
            </button>
          ))}
        </div>
        <div className="record">
          Humans {score.humans} — <b>{score.machine}</b> Machine · {score.draws} draw{score.draws === 1 ? "" : "s"}
          {wallet
            ? <span className="addr">{wallet.slice(0, 6)}…{wallet.slice(-4)}</span>
            : <button className="chip" onClick={() => void connect()}>Connect wallet</button>}
        </div>
      </header>

      <main>
        {phase !== "draft" && round && stored && (
          <section className="card">
            <div className="fightbill">★ {market.label} · Round {stored.roundId} · {Number(round.stake) / 1e6} USDG a side ★</div>
            <div className="vs-stage">
              <div className="corner">
                <div className="tag">Challenger</div>
                <div className="name">YOU</div>
                {inProgress && playerPnl ? (
                  <div className={`ret ${playerPnl.totalPct >= 0 ? "up" : "dn"}`}>
                    {playerPnl.totalPct >= 0 ? "+" : ""}{playerPnl.totalPct.toFixed(2)}%
                  </div>
                ) : (
                  <div className={`ret ${retClass(yourReturn)}`}>
                    {yourReturn !== 0n ? pct(yourReturn) : "SEALED"}
                  </div>
                )}
              </div>
              <div className="vs-burst">
                {settling ? (
                  <>
                    <div className="spinner" />
                    <div className="sub">settling…</div>
                  </>
                ) : phase === "settled" ? (
                  <>
                    <div className={`ring ${outcome}`} />
                    <div className="t res">{outcome === "win" ? "✓" : outcome === "loss" ? "✕" : "="}</div>
                    <div className="sub">final</div>
                  </>
                ) : (
                  <>
                    <div className="ring" />
                    <div className="t">{BURST[phase]?.t(mmss) ?? "…"}</div>
                    <div className="sub">{BURST[phase]?.sub ?? ""}</div>
                  </>
                )}
              </div>
              <div className="corner red">
                <div className="tag">House Fighter</div>
                <div className="name">PIT BOSS</div>
                {inProgress && bossPnl ? (
                  <div className={`ret ${bossPnl.totalPct >= 0 ? "up" : "dn"}`}>
                    {bossPnl.totalPct >= 0 ? "+" : ""}{bossPnl.totalPct.toFixed(2)}%
                  </div>
                ) : (
                  <div className={`ret ${retClass(bossReturn)}`}>
                    {bossReturn !== 0n ? pct(bossReturn) : "▮▮▮▮▮"}
                  </div>
                )}
              </div>
            </div>
            {inProgress && (playerPnl || bossPnl) && (
              <div className="livebooks">
                <HandBook title="Your hand" pnl={playerPnl} waitingNote="loading…" />
                <HandBook title="Pit Boss hand" pnl={bossPnl} waitingNote="waiting for the Boss to show its hand…" />
              </div>
            )}
            {phase === "settled" && (
              <div className={`result ${outcome}`}>
                <div className="result-title">{RESULT[outcome].title}</div>
                <div className="result-sub">{RESULT[outcome].sub}</div>
                <div className="result-scores">You {pct(yourReturn)} · Pit Boss {pct(bossReturn)}</div>
              </div>
            )}
            <div className="talkline"><b>PIT BOSS</b>&nbsp; “{bossLine(phase, yourReturn, bossReturn)}”</div>
            {settling && (
              <div className="settling-banner">
                <span className="dots"><span /><span /><span /></span>
                Bell rung — locking final prices and settling the pot on-chain. This can take ~20–40s on testnet.
              </div>
            )}
            {phase === "live" && !settling && !youRevealed && busy !== null && (
              <div className="settling-banner">
                <span className="dots"><span /><span /><span /></span>
                {busy} Confirm in your wallet to lock your hand in and join the race.
              </div>
            )}
            {phase === "live" && !settling && !youRevealed && busy === null && (
              <>
                <button className="enter" onClick={() => void revealHand()}>LOCK IN YOUR HAND</button>
                <p className="fine">Confirm in your wallet to lock your hand on-chain — without it you forfeit at the bell.</p>
              </>
            )}
            {phase === "live" && !settling && youRevealed && (
              <p className="fine">You're locked in — watch both hands race. Settles automatically at the bell.</p>
            )}
            {phase === "settled" && (
              <button className="enter" onClick={runItBack}>RUN IT BACK</button>
            )}
          </section>
        )}

        {phase === "draft" && (
          <>
            <h2 className="bill">— {market.label} pit · pick three, weight your swing, pick your side —</h2>
            <div className="draftgrid">
              {market.assets.map((asset, idx) => {
                const picked = draft.picks.includes(idx);
                return (
                  <button
                    key={asset.symbol}
                    className={`stock ${picked ? "picked" : ""}`}
                    data-w={draft.weights[idx] ?? 0}
                    onClick={() => togglePick(idx)}
                  >
                    <div className="sym">{asset.symbol}</div>
                    <div className="px">{prices[asset.symbol] ? `$${fmtPrice(prices[asset.symbol].price)}` : "…"}</div>
                  </button>
                );
              })}
            </div>

            {draft.picks.length > 0 && (
              <div className="weights">
                {draft.picks.map((idx) => (
                  <label key={idx}>
                    <button
                      type="button"
                      className={`dirbtn ${draft.longs[idx] ? "long" : "short"}`}
                      onClick={() => toggleDirection(idx)}
                      title="Toggle long/short"
                    >
                      {draft.longs[idx] ? "LONG ▲" : "SHORT ▼"}
                    </button>
                    {market.assets[idx].symbol}
                    <input
                      type="number" min={1} max={98} value={draft.weights[idx] ?? 0}
                      onChange={(event) => setDraft((prev) => ({
                        ...prev,
                        weights: { ...prev.weights, [idx]: Number(event.target.value) },
                      }))}
                    />%
                  </label>
                ))}
                <span className={`sum ${weightTotal === 100 ? "ok" : "bad"}`}>Σ {weightTotal}%</span>
              </div>
            )}

            <div className="weighbar">
              {TIERS.map((tier, idx) => (
                <button key={tier.label} className={`chip ${idx === tierIdx ? "gold" : ""}`} onClick={() => setTierIdx(idx)}>
                  {tier.label}
                </button>
              ))}
              <label className="chip stakein">
                Stake <input value={stake} onChange={(event) => setStake(event.target.value)} /> USDG
              </label>
            </div>

            <button
              className="enter"
              disabled={!wallet || !draftReady || busy !== null || !marketOpen}
              onClick={() => void enterThePit()}
            >
              {busy ?? (!wallet ? "CONNECT WALLET TO FIGHT" : !marketOpen ? `${market.label.toUpperCase()} MARKET CLOSED` : "STEP INTO THE PIT")}
            </button>
            <p className="fine">Picks sealed with commit-reveal · long or short · settles on-chain in USDG · winner takes the pot</p>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </main>
    </>
  );
}
