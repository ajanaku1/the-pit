import { createPublicClient, createWalletClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodTestnet, PLAYER_KEY, GAS_LIMIT, ADDRESSES } from "./config.js";

export const playerAccount = privateKeyToAccount(PLAYER_KEY);

const transport = http(undefined, { retryCount: 5, retryDelay: 3_000, timeout: 30_000 });
export const publicClient = createPublicClient({ chain: robinhoodTestnet, transport });
export const walletClient = createWalletClient({ account: playerAccount, chain: robinhoodTestnet, transport });

export const battleAbi = parseAbi([
  "struct Hand { uint8[3] tokenIdx; uint16[3] weightsBps; uint8 longMask; bool revealed; }",
  "struct Round { address creator; address opponent; uint96 stake; uint8 tier; uint8 status; uint40 createdAt; uint40 startTime; uint40 endTime; uint40 snapshotTime; bytes32 creatorCommit; bytes32 opponentCommit; uint192[5] startPrices; uint192[5] endPrices; Hand creatorHand; Hand opponentHand; uint256 creatorReturn; uint256 opponentReturn; }",
  "function nextRoundId() view returns (uint256)",
  "function getRound(uint256 roundId) view returns (Round)",
  "function commitHash(uint256 roundId, address player, uint8[3] tokenIdx, uint16[3] weightsBps, uint8 longMask, bytes32 salt) pure returns (bytes32)",
  "function createRound(uint8 tier, uint96 stake, bytes32 commit, address opponent) returns (uint256)",
  "function reveal(uint256 roundId, uint8[3] tokenIdx, uint16[3] weightsBps, uint8 longMask, bytes32 salt)",
  "function humanWins() view returns (uint256)",
  "function machineWins() view returns (uint256)",
  "function drawCount() view returns (uint256)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

type WriteArgs = {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

export async function sendTx(call: WriteArgs): Promise<`0x${string}`> {
  const hash = await walletClient.writeContract({ ...call, gas: GAS_LIMIT } as Parameters<
    typeof walletClient.writeContract
  >[0]);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return hash;
}

export async function readRound(battle: Address, roundId: bigint) {
  return publicClient.readContract({
    address: battle, abi: battleAbi, functionName: "getRound", args: [roundId],
  });
}
