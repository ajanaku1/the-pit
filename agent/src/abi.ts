import { parseAbi } from "viem";

export const battleAbi = parseAbi([
  "struct Hand { uint8[3] tokenIdx; uint16[3] weightsBps; uint8 longMask; bool revealed; }",
  "struct Round { address creator; address opponent; uint96 stake; uint8 tier; uint8 status; uint40 createdAt; uint40 startTime; uint40 endTime; uint40 snapshotTime; bytes32 creatorCommit; bytes32 opponentCommit; uint192[5] startPrices; uint192[5] endPrices; Hand creatorHand; Hand opponentHand; uint256 creatorReturn; uint256 opponentReturn; }",
  "function nextRoundId() view returns (uint256)",
  "function getRound(uint256 roundId) view returns (Round)",
  "function commitHash(uint256 roundId, address player, uint8[3] tokenIdx, uint16[3] weightsBps, uint8 longMask, bytes32 salt) pure returns (bytes32)",
  "function joinRound(uint256 roundId, bytes32 commit)",
  "function snapshot(uint256 roundId)",
  "function reveal(uint256 roundId, uint8[3] tokenIdx, uint16[3] weightsBps, uint8 longMask, bytes32 salt)",
  "function settle(uint256 roundId)",
  "function refundStale(uint256 roundId)",
  "function humanWins() view returns (uint256)",
  "function machineWins() view returns (uint256)",
  "function drawCount() view returns (uint256)",
  "function REVEAL_WINDOW() view returns (uint256)",
  "event RoundCreated(uint256 indexed roundId, address indexed creator, uint8 tier, uint96 stake, address opponent)",
  "event RoundSettled(uint256 indexed roundId, address winner, uint256 payout)",
]);

export const relayAbi = parseAbi([
  "struct PriceReport { address token; uint192 price; uint32 observationsTimestamp; bool marketOpen; }",
  "function postReports(bytes[] signedReports)",
  "function reportDigest(PriceReport report) view returns (bytes32)",
  "function getPrice(address token) view returns (uint192 price, uint32 observedAt)",
  "function isMarketOpen() view returns (bool)",
]);

export const routerAbi = parseAbi([
  "function quoteTokenForUSDG(address token, uint256 tokenIn) view returns (uint256)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
]);

export const stockAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function uiMultiplier() view returns (uint256)",
  "function newUIMultiplier() view returns (uint256)",
  "function effectiveAt() view returns (uint256)",
]);
