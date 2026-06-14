import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Allocation } from "./boss.js";

export type RoundCommitment = {
  /** composite key "<marketKey>:<roundId>" — round ids collide across battles */
  key: string;
  allocation: Allocation;
  salt: `0x${string}`;
  revealed: boolean;
};

type AgentState = { commitments: Record<string, RoundCommitment> };

const STATE_FILE = new URL("../state.json", import.meta.url).pathname;

function load(): AgentState {
  if (!existsSync(STATE_FILE)) return { commitments: {} };
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as AgentState;
}

const state = load();

function save(): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function commitKey(marketKey: string, roundId: bigint): string {
  return `${marketKey}:${roundId}`;
}

export function saveCommitment(commitment: RoundCommitment): void {
  state.commitments[commitment.key] = commitment;
  save();
}

export function getCommitment(key: string): RoundCommitment | undefined {
  return state.commitments[key];
}

export function markRevealed(key: string): void {
  const commitment = state.commitments[key];
  if (commitment) {
    commitment.revealed = true;
    save();
  }
}
