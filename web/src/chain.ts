import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  parseAbi,
  type Address,
  type EIP1193Provider,
} from "viem";

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" } },
});

export const ADDRESSES = {
  usdg: "0x7E955252E15c84f5768B83c41a71F9eba181802F" as Address,
  boss: "0x8C212e9DaA2Fc4179e7Bc29fea37B047221B1f31" as Address,
};

export const TIERS = [
  { label: "1 min", tier: 0, seconds: 60 },
  { label: "5 min", tier: 1, seconds: 300 },
  { label: "15 min", tier: 2, seconds: 900 },
  { label: "1 hour", tier: 3, seconds: 3600 },
] as const;

export const battleAbi = parseAbi([
  "struct Hand { uint8[3] tokenIdx; uint16[3] weightsBps; uint8 longMask; bool revealed; }",
  "struct Round { address creator; address opponent; uint96 stake; uint8 tier; uint8 status; uint40 createdAt; uint40 startTime; uint40 endTime; uint40 snapshotTime; bytes32 creatorCommit; bytes32 opponentCommit; uint192[5] startPrices; uint192[5] endPrices; Hand creatorHand; Hand opponentHand; uint256 creatorReturn; uint256 opponentReturn; }",
  "function nextRoundId() view returns (uint256)",
  "function getRound(uint256 roundId) view returns (Round)",
  "function commitHash(uint256 roundId, address player, uint8[3] tokenIdx, uint16[3] weightsBps, uint8 longMask, bytes32 salt) pure returns (bytes32)",
  "function createRound(uint8 tier, uint96 stake, bytes32 commit, address opponent) returns (uint256)",
  "function reveal(uint256 roundId, uint8[3] tokenIdx, uint16[3] weightsBps, uint8 longMask, bytes32 salt)",
  "function settle(uint256 roundId)",
  "function humanWins() view returns (uint256)",
  "function machineWins() view returns (uint256)",
  "function drawCount() view returns (uint256)",
  "event RoundCreated(uint256 indexed roundId, address indexed creator, uint8 tier, uint96 stake, address opponent)",
]);

export const erc20Abi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export const relayAbi = parseAbi([
  "function isMarketOpen() view returns (bool)",
  "function getPrice(address token) view returns (uint192 price, uint32 observedAt)",
]);

export const publicClient = createPublicClient({
  chain: robinhoodTestnet,
  transport: http(undefined, { retryCount: 5, retryDelay: 2_000, timeout: 20_000 }),
});

export function getInjectedProvider(): EIP1193Provider | undefined {
  return (window as { ethereum?: EIP1193Provider }).ethereum;
}

export function makeWalletClient(provider: EIP1193Provider) {
  return createWalletClient({ chain: robinhoodTestnet, transport: custom(provider) });
}

export const GAS_LIMIT = 400_000n;

export const RoundStatus = {
  Open: 1, Running: 2, Snapshotted: 3, Settled: 4, Cancelled: 5,
} as const;
