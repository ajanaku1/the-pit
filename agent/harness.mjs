// Drives the web UI with an injected wallet (player key) to screenshot the
// live race, settling, and result states. Run: node harness.mjs
import http from "node:http";
import "dotenv/config";
import { chromium } from "/tmp/pit-faucet/node_modules/playwright/index.mjs";
import { createWalletClient, createPublicClient, http as vhttp, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://rpc.testnet.chain.robinhood.com";
const chain = defineChain({
  id: 46630, name: "RH", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const account = privateKeyToAccount(process.env.PLAYER_KEY);
const wallet = createWalletClient({ account, chain, transport: vhttp(RPC) });
const pub = createPublicClient({ chain, transport: vhttp(RPC) });

// Local signer: the injected provider POSTs eth_sendTransaction params here.
const signer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const tx = JSON.parse(body);
      const hash = await wallet.sendTransaction({
        to: tx.to, data: tx.data,
        value: tx.value ? BigInt(tx.value) : 0n,
        gas: tx.gas ? BigInt(tx.gas) : 400000n,
      });
      res.end(JSON.stringify({ hash }));
    } catch (e) {
      res.statusCode = 500; res.end(JSON.stringify({ error: String(e).slice(0, 200) }));
    }
  });
});
await new Promise((r) => signer.listen(8599, r));

const INJECT = `
window.ethereum = {
  isMetaMask: true,
  request: async ({ method, params }) => {
    const ADDR = "${account.address}";
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDR];
    if (method === "eth_chainId") return "0xb626";
    if (method === "net_version") return "46630";
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
    if (method === "eth_sendTransaction") {
      const r = await fetch("http://127.0.0.1:8599/send", { method: "POST", body: JSON.stringify(params[0]) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      return j.hash;
    }
    const r = await fetch("${RPC}", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j.result;
  },
  on: () => {}, removeListener: () => {},
};
`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 860 } });
await page.addInitScript(INJECT);
const log = (m) => console.log(`[harness] ${m}`);
page.on("pageerror", (e) => log(`PAGEERROR: ${String(e).slice(0, 200)}`));
page.on("console", (m) => { if (m.type() === "error") log(`CONSOLE: ${m.text().slice(0, 200)}`); });

await page.goto("http://localhost:5173", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
log(`ethereum injected: ${await page.evaluate(() => !!window.ethereum)}`);
await page.locator(".chip", { hasText: "Connect wallet" }).click();
// Wait for the address chip to confirm the wallet connected.
await page.waitForSelector(".addr", { timeout: 15000 }).then(() => log("wallet connected")).catch(() => log("CONNECT FAILED"));
await page.waitForTimeout(1000);

// Draft: pick first 3 stocks (default weights 50/30/20 sum 100)
const cards = page.locator(".stock");
await cards.nth(0).click(); await cards.nth(1).click(); await cards.nth(2).click();
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/ux-draft.png", fullPage: true });
log("drafted; entering the pit…");
for (let attempt = 0; attempt < 4; attempt++) {
  await page.getByText("STEP INTO THE PIT").click().catch(() => {});
  await page.waitForTimeout(8000);
  if (await page.locator(".card").count()) { log("round opened"); break; }
  if (await page.locator(".error").count()) { log(`enter errored (RPC), retry ${attempt + 1}…`); continue; }
}
// Auto-reveal fires on its own once the Boss joins (injected wallet auto-signs).
log("waiting for live race (auto-reveal)…");
await page.waitForSelector(".livebooks", { timeout: 90000 }).catch(() => log("no live books yet"));
await page.waitForTimeout(5000);
await page.screenshot({ path: "/tmp/ux-live-race.png", fullPage: true });
log("captured live race; waiting for settling/result…");

// Poll for settling banner then result
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(4000);
  const settling = await page.locator(".settling-banner").count();
  const result = await page.locator(".result").count();
  if (settling && !result) { await page.screenshot({ path: "/tmp/ux-settling.png", fullPage: true }); log("captured settling"); }
  if (result) { await page.screenshot({ path: "/tmp/ux-result.png", fullPage: true }); log("captured result — done"); break; }
}
await browser.close();
signer.close();
log("finished");
process.exit(0);
