# Deployments: Robinhood Chain testnet (46630)

## Status: DEPLOYED 2026-06-11

Deployer / relay signer / boss wallet (testnet burner, key in `contracts/.env`, gitignored):
`0x8C212e9DaA2Fc4179e7Bc29fea37B047221B1f31`

The faucet (https://faucet.testnet.chain.robinhood.com) sits behind a Vercel
Security Checkpoint that blocks automated browsers: fund the address above
manually (0.05 ETH + 5 of each stock token / 24h).

**USDG source (solved):** the testnet has a native `SwapRouter` at
`0x2953A82d44fDACfa7a49BfFF24f7Cc5879F10805` trading stocks ↔ USDG
(`swapExactTokenForUSDG` / `swapExactUSDGForToken` / `quoteTokenForUSDG`).
Faucet stocks → USDG in one swap. Router quotes also work as a sanity price
source for the relay keeper.

## Deploy command (once funded)

```bash
cd contracts
set -a && source .env && set +a
forge script script/Deploy.s.sol --rpc-url "$ROBINHOOD_RPC" --broadcast
```

## Addresses

| Contract | Address | Deploy tx |
|---|---|---|
| PriceRelay (stocks) | `0xA8799b40d1BD22CfD23AEf49561B41A156C64622` | `0x2bf60774622951d1193c061415edd7322b0fcc6226dd1c3346749523badd3110` |
| CryptoRelay (24/7) | `0xbe1DCb3FBfDefd0962801a77e534C97F6468e4af` | 2026-06-13 |
| **StocksBattle v4 (one-tx settle, ACTIVE)** | `0xDe530201016Cad12DE4dE169885E4576526832F7` | 2026-06-14, settle reads fresh prices + pays in one tx (no snapshot step) |
| **CryptoBattle v4 (one-tx settle, ACTIVE)** | `0xf22F98fACbF7e1020F6EF6B386dF17d57C82827C` | 2026-06-14 |
| StocksBattle v3 (retired) | `0x9F5C9A28055Cc1EE4c29FC5B4a34bD1647499972` | reveal-at-start; superseded by v4 |
| CryptoBattle v3 (retired) | `0x827CD77F48bA0493936286D56c6D370a5b6Db2bA` | superseded by v4 |
| BossVault | `0x83FE2617202FC720A50E3e194596c99861B84BBE` | `0xf0cf68275327448809d014362790e18df7bfa94d2fded22c8196c22acebf8c9c` |
| Battle v2 (long/short, retired) | `0x18c215934fD27291Ead3dc8acC264773Bb2201b5` | superseded by v3 |
| CryptoBattle v1 (retired) | `0xF46f84Bff4ABAF8a5fBf619568E4Fb35E24Df220` | superseded by v3 |
| Battle v1 (long-only, retired) | `0xC94701348462fcc12Af6D5AB5448715A1F1a5a68` | `0xc158ef3be8dfb575d8ea870d77a8f6c4574e370c7e7ae987cdc3ff89de1d2c19` |

**Reveal-at-start (v3):** both sides commit blind (createRound/joinRound), then
`reveal()` becomes callable the instant the round is Running: picks are stored
on-chain publicly so both portfolios can be watched racing live. Returns are
computed at `settle()` from the stored hands + start/end prices. Blind
counter-draft preserved (opponent commits before any reveal).

## Crypto mode (24/7)

Stocks close on weekends; crypto mode lets play continue. Built with **zero
contract changes**: a second relay + Battle (same bytecode), separate so the
market-status flag is independent (crypto keeper always signs open). The 5
"tokens" are virtual price-keys (player allocations are virtual; USDG is still
the stake/payout). Keeper signs prices from CoinGecko (primary) / Binance (fallback).

| Asset | Price-key address |
|---|---|
| BTC | `0x69c88A0Ec0266c9Ab7450454Ef33c541420F9ce2` |
| ETH | `0x6cD32d64CCE33753D905CD95b7Cf5d822F566dDF` |
| BNB | `0xCD02e4444900Fc9D3d2Ad0729c7c6d72aFF20DFd` |
| SOL | `0x7f1985ADf8D2e09Ebc3A193D1a832130d4f29a40` |
| XRP | `0xCccb6536d8FEE02776f847fDa40A5Ce3a827e43D` |

## End-to-end proof (2026-06-11/12, round 2, 1m tier, 50 USDG stakes)

| Step | Tx |
|---|---|
| createRound (player) | `0x68c3c6a22b2845686ae79c8dceddb3ef43139b4da3d892d36d89f22f23617323` |
| joinRound (boss) | `0xce8d28d01b540b3a81f6d120dcf84185e1471260611ec38a85edda0c5cdce700` |
| snapshot | `0x777cb69b21f0dd58c29e0b2ec9a3149d10db6318444485acd7a4f7bcf92e1025` |
| settle (boss won, +2.58% vs +1.84%) | `0xe9785fc49fd9e992f04e1570c7e03ec5d4dc1498e8d451df7bcbad65eddf87aa` |
| refundStale demo (round 1, after RPC outage) | `0x492d078c35334e5b6867cfc4553c8ca1af28abfcc03ce1384130e0cdc1f71803` |

Leaderboard on-chain: humanWins 0, machineWins 1, draws 0.

**Ops notes for the keeper/agent:**
- RPC has outage windows (TLS resets, minutes long). Retry everything; treat
  a 1m round that misses its snapshot window as refundable, not fatal.
- Gas estimation underestimates during instability → mined OOG with
  status=error. Always send with explicit `--gas-limit 400000` (cast) or
  `--gas-estimate-multiplier 200` (forge script).
- Player wallet (burner #2, key in `contracts/.env`):
  `0x054175330a282C6D8D46337C9E3B0BaEd5da106B`

## Reference (verified 2026-06-11)

| Token | Address |
|---|---|
| TSLA | 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E |
| AMZN | 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02 |
| PLTR | 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0 |
| NFLX | 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93 |
| AMD | 0x71178BAc73cBeb415514eB542a8995b82669778d |
| USDG | 0x7E955252E15c84f5768B83c41a71F9eba181802F |
| WETH | 0x7943e237c7F95DA44E0301572D358911207852Fa |

RPC: https://rpc.testnet.chain.robinhood.com · Explorer: https://explorer.testnet.chain.robinhood.com
