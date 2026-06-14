import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodTestnet, BOSS_KEY, GAS_LIMIT } from "./config.js";

export const account = privateKeyToAccount(BOSS_KEY);

const readTransport = http(undefined, { retryCount: 5, retryDelay: 3_000, timeout: 30_000 });
// No transport-level retries for sends: rebroadcasting a landed tx surfaces
// "nonce too low" and confuses the app-level retry into double-sending.
const writeTransport = http(undefined, { retryCount: 0, timeout: 60_000 });

export const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: readTransport });
export const walletClient = createWalletClient({ account, chain: robinhoodTestnet, transport: writeTransport });

type WriteArgs = {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

// Keeper loop and round state machine share one account; serialize sends so
// concurrent timers can't grab the same nonce.
let txQueue: Promise<unknown> = Promise.resolve();

/** Send a tx with explicit gas (testnet estimation lowballs) and wait for inclusion. */
export function sendTx(call: WriteArgs): Promise<`0x${string}`> {
  const next = txQueue.then(async () => {
    const hash = await walletClient.writeContract({ ...call, gas: GAS_LIMIT } as Parameters<
      typeof walletClient.writeContract
    >[0]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") throw new Error(`tx reverted: ${hash} (${call.functionName})`);
    return hash;
  });
  txQueue = next.catch(() => undefined); // keep the queue alive after failures
  return next;
}

/** Retry an async op through transient RPC outages. Flat short backoff so a
 * brief RPC blip recovers in ~2s instead of escalating to 25s — settlement
 * latency was dominated by long backoffs, not the chain. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 8): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.warn(`[retry ${i + 1}/${attempts}] ${label}: ${(error as Error).message?.slice(0, 120)}`);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw lastError;
}
