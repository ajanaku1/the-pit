// Render host: runs the Pit Boss agent + Telegram bot, serves a health check,
// and exposes a /claim faucet that gives new players 10 USDG to start.
import http from "node:http";
import { spawn } from "node:child_process";
import { createWalletClient, createPublicClient, http as vhttp, defineChain, parseAbi, isAddress, getAddress } from "./agent/node_modules/viem/_esm/index.js";
import { privateKeyToAccount } from "./agent/node_modules/viem/_esm/accounts/index.js";

const PORT = process.env.PORT || 3000;
const RPC = process.env.ROBINHOOD_RPC || "https://rpc.testnet.chain.robinhood.com";
const USDG = "0x7E955252E15c84f5768B83c41a71F9eba181802F";
const CLAIM_AMOUNT = 10_000_000n; // 10 USDG (6 decimals)
const procs = {};

// ---- child processes: agent + bot ----
function run(name, cwd, args) {
  const child = spawn("./node_modules/.bin/tsx", args, { cwd, env: process.env, stdio: "inherit" });
  procs[name] = { up: true, since: Date.now() };
  child.on("exit", (code) => {
    procs[name] = { up: false, code };
    console.log(`[host] ${name} exited (${code}); restarting in 3s`);
    setTimeout(() => run(name, cwd, args), 3000);
  });
  child.on("error", (err) => console.log(`[host] ${name} error: ${err.message}`));
}
run("agent", "agent", ["src/index.ts"]);
run("bot", "bot", ["src/bot.ts"]);

// ---- USDG faucet (claim 10 USDG once) ----
const chain = defineChain({ id: 46630, name: "RH", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const erc20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);
const claimed = new Set();
let faucet = null;
if (process.env.PRIVATE_KEY) {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  faucet = {
    account,
    wallet: createWalletClient({ account, chain, transport: vhttp(RPC) }),
    pub: createPublicClient({ chain, transport: vhttp(RPC) }),
  };
}

async function claim(to) {
  if (!faucet) return { error: "faucet not configured" };
  if (!isAddress(to)) return { error: "bad address" };
  const addr = getAddress(to);
  if (claimed.has(addr.toLowerCase())) return { error: "already claimed" };
  const bal = await faucet.pub.readContract({ address: USDG, abi: erc20, functionName: "balanceOf", args: [addr] });
  if (bal >= 2_000_000n) return { error: "you already have USDG to play with" };
  claimed.add(addr.toLowerCase());
  try {
    const hash = await faucet.wallet.writeContract({
      address: USDG, abi: erc20, functionName: "transfer", args: [addr, CLAIM_AMOUNT],
      gas: 200_000n, maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 100_000_000n,
    });
    return { ok: true, hash, amount: "10" };
  } catch (e) {
    claimed.delete(addr.toLowerCase()); // let them retry on failure
    return { error: String(e?.shortMessage || e?.message || e).slice(0, 160) };
  }
}

const cors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
};

http
  .createServer(async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, `http://localhost`);
    if (url.pathname === "/claim") {
      const to = url.searchParams.get("to") || "";
      const result = await claim(to);
      res.writeHead(result.error ? 400 : 200, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "the-pit-keeper", procs }));
  })
  .listen(PORT, () => console.log(`[host] http + faucet on :${PORT}`));
