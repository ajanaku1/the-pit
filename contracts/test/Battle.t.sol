// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RelayHelper} from "./Helpers.sol";
import {Battle} from "../src/Battle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockERC20} from "./Mocks.sol";

contract BattleTest is RelayHelper {
    Battle battle;
    MockERC20 usdg;
    address[5] stocks;

    address human = address(0x100);
    address boss = address(0x200);
    uint96 constant STAKE = 100e6; // USDG, 6 decimals

    bytes32 constant HUMAN_SALT = keccak256("human-salt");
    bytes32 constant BOSS_SALT = keccak256("boss-salt");

    // Human: 50% TSLA, 30% AMZN, 20% PLTR. Boss: 50% NFLX, 30% AMD, 20% TSLA.
    uint8[3] humanIdx = [0, 1, 2];
    uint16[3] humanWeights = [5000, 3000, 2000];
    uint8[3] bossIdx = [3, 4, 0];
    uint16[3] bossWeights = [5000, 3000, 2000];

    function setUp() public {
        vm.warp(1_750_000_000);
        _setUpRelay();
        usdg = new MockERC20("USDG", "USDG", 6);
        for (uint256 i = 0; i < 5; i++) {
            stocks[i] = address(uint160(0x1000 + i));
        }
        battle = new Battle(IERC20(address(usdg)), relay, stocks, boss);

        usdg.mint(human, 1_000e6);
        usdg.mint(boss, 1_000e6);
        vm.prank(human);
        usdg.approve(address(battle), type(uint256).max);
        vm.prank(boss);
        usdg.approve(address(battle), type(uint256).max);

        _postFlat(100e18, true); // all stocks at $100, market open
    }

    function _postFlat(uint192 price, bool marketOpen) internal {
        uint192[5] memory tokenPrices = [price, price, price, price, price];
        _postPrices(stocks, tokenPrices, marketOpen);
    }

    function _createAs(
        address who,
        uint8[3] memory tokenIdx,
        uint16[3] memory weights,
        bytes32 salt,
        address opponent
    ) internal returns (uint256) {
        bytes32 commit = battle.commitHash(battle.nextRoundId(), who, tokenIdx, weights, 7, salt);
        vm.prank(who);
        return battle.createRound(Battle.Tier.OneMinute, STAKE, commit, opponent);
    }

    function _joinAs(address who, uint256 roundId, uint8[3] memory tokenIdx, uint16[3] memory weights, bytes32 salt)
        internal
    {
        bytes32 commit = battle.commitHash(roundId, who, tokenIdx, weights, 7, salt);
        vm.prank(who);
        battle.joinRound(roundId, commit);
    }

    /// @dev Open a 1m round (human creates, boss joins). Returns roundId.
    function _openRound() internal returns (uint256 roundId) {
        roundId = _createAs(human, humanIdx, humanWeights, HUMAN_SALT, address(0));
        _joinAs(boss, roundId, bossIdx, bossWeights, BOSS_SALT);
    }

    /// @dev Move past round end and post end prices. v4 settle reads them
    /// directly — no separate snapshot step. Round stays Running until settle.
    function _closeRound(uint256, uint192[5] memory endPrices) internal {
        vm.warp(block.timestamp + 61);
        _postPrices(stocks, endPrices, true);
    }

    function _revealBoth(uint256 roundId) internal {
        vm.prank(human);
        battle.reveal(roundId, humanIdx, humanWeights, 7, HUMAN_SALT);
        vm.prank(boss);
        battle.reveal(roundId, bossIdx, bossWeights, 7, BOSS_SALT);
    }

    // ---------------------------------------------------------- happy paths

    function test_humanWins_highestReturn() public {
        uint256 roundId = _openRound();
        // TSLA +10%, everything else flat: human holds 50% TSLA, boss 20%.
        _closeRound(roundId, [uint192(110e18), 100e18, 100e18, 100e18, 100e18]);
        _revealBoth(roundId);

        uint256 humanBefore = usdg.balanceOf(human);
        battle.settle(roundId);
        assertEq(usdg.balanceOf(human), humanBefore + 2 * uint256(STAKE));
        assertEq(battle.humanWins(), 1);
        assertEq(battle.machineWins(), 0);
        assertEq(battle.winsOf(human), 1);
    }

    function test_bossWins_highestReturn() public {
        uint256 roundId = _openRound();
        // NFLX +10%: boss holds 50% NFLX, human holds none.
        _closeRound(roundId, [uint192(100e18), 100e18, 100e18, 110e18, 100e18]);
        _revealBoth(roundId);

        uint256 bossBefore = usdg.balanceOf(boss);
        battle.settle(roundId);
        assertEq(usdg.balanceOf(boss), bossBefore + 2 * uint256(STAKE));
        assertEq(battle.machineWins(), 1);
    }

    function test_leastLossWins_bothNegative() public {
        uint256 roundId = _openRound();
        // TSLA -20%, NFLX -10%: human (50% TSLA) loses more than boss (50% NFLX, 20% TSLA).
        _closeRound(roundId, [uint192(80e18), 100e18, 100e18, 90e18, 100e18]);
        _revealBoth(roundId);

        uint256 bossBefore = usdg.balanceOf(boss);
        battle.settle(roundId);
        assertEq(usdg.balanceOf(boss), bossBefore + 2 * uint256(STAKE));

        Battle.Round memory round = battle.getRound(roundId);
        assertLt(round.creatorReturn, 1e18); // both genuinely red
        assertLt(round.opponentReturn, 1e18);
    }

    function test_exactTie_splitsPot() public {
        uint256 roundId = _openRound();
        _closeRound(roundId, [uint192(100e18), 100e18, 100e18, 100e18, 100e18]); // all flat
        _revealBoth(roundId);

        uint256 humanBefore = usdg.balanceOf(human);
        uint256 bossBefore = usdg.balanceOf(boss);
        battle.settle(roundId);
        assertEq(usdg.balanceOf(human), humanBefore + STAKE);
        assertEq(usdg.balanceOf(boss), bossBefore + STAKE);
        assertEq(battle.drawCount(), 1);
        assertEq(battle.humanWins() + battle.machineWins(), 0);
    }

    // ---------------------------------------------------------- forfeits

    function test_noReveal_forfeitsToRevealer() public {
        uint256 roundId = _openRound();
        _closeRound(roundId, [uint192(110e18), 100e18, 100e18, 100e18, 100e18]);
        vm.prank(boss);
        battle.reveal(roundId, bossIdx, bossWeights, 7, BOSS_SALT);
        // human never reveals; settle only possible after the forfeit grace
        vm.expectRevert(Battle.TooEarly.selector);
        battle.settle(roundId);

        vm.warp(block.timestamp + battle.REVEAL_GRACE());
        uint256 bossBefore = usdg.balanceOf(boss);
        battle.settle(roundId);
        assertEq(usdg.balanceOf(boss), bossBefore + 2 * uint256(STAKE));
        assertEq(battle.machineWins(), 1); // forfeit counts as a boss win
    }

    function test_mutualNoShow_splitRefund() public {
        uint256 roundId = _openRound();
        _closeRound(roundId, [uint192(110e18), 100e18, 100e18, 100e18, 100e18]);
        vm.warp(block.timestamp + battle.REVEAL_GRACE());

        uint256 humanBefore = usdg.balanceOf(human);
        uint256 bossBefore = usdg.balanceOf(boss);
        battle.settle(roundId);
        assertEq(usdg.balanceOf(human), humanBefore + STAKE);
        assertEq(usdg.balanceOf(boss), bossBefore + STAKE);
    }

    function test_revert_revealAfterSettle() public {
        uint256 roundId = _openRound();
        _closeRound(roundId, [uint192(110e18), 100e18, 100e18, 100e18, 100e18]);
        _revealBoth(roundId);
        battle.settle(roundId);
        // Round is Settled — no more reveals.
        vm.prank(human);
        vm.expectRevert(Battle.BadStatus.selector);
        battle.reveal(roundId, humanIdx, humanWeights, 7, HUMAN_SALT);
    }

    // ---------------------------------------------------------- guards

    function test_revert_createWhenMarketClosed() public {
        vm.warp(block.timestamp + 1);
        _postFlat(100e18, false);
        vm.prank(human);
        vm.expectRevert(Battle.MarketClosed.selector);
        battle.createRound(Battle.Tier.OneMinute, STAKE, bytes32(uint256(1)), address(0));
    }

    function test_revert_joinWhenMarketClosed() public {
        uint256 roundId = _createAs(human, humanIdx, humanWeights, HUMAN_SALT, address(0));
        vm.warp(block.timestamp + 1);
        _postFlat(100e18, false);
        vm.prank(boss);
        vm.expectRevert(Battle.MarketClosed.selector);
        battle.joinRound(roundId, bytes32(uint256(1)));
    }

    function test_revert_joinWithStalePrices() public {
        uint256 roundId = _createAs(human, humanIdx, humanWeights, HUMAN_SALT, address(0));
        vm.warp(block.timestamp + battle.MAX_PRICE_AGE() + 1); // prices now stale
        vm.prank(boss);
        vm.expectRevert(Battle.StalePrice.selector);
        battle.joinRound(roundId, bytes32(uint256(1)));
    }

    function test_revert_settleBeforeEnd() public {
        uint256 roundId = _openRound();
        _revealBoth(roundId);
        vm.expectRevert(Battle.TooEarly.selector); // before the bell
        battle.settle(roundId);
    }

    function test_revert_settleWithPreEndPrices() public {
        uint256 roundId = _openRound();
        _revealBoth(roundId);
        vm.warp(block.timestamp + 61); // round over, but relay still has start prices
        vm.expectRevert(Battle.StalePrice.selector);
        battle.settle(roundId);
    }

    function test_refundStale_whenRelayDies() public {
        uint256 roundId = _openRound();
        vm.warp(block.timestamp + 61 + battle.SETTLE_DEADLINE() + 1);

        uint256 humanBefore = usdg.balanceOf(human);
        uint256 bossBefore = usdg.balanceOf(boss);
        battle.refundStale(roundId);
        assertEq(usdg.balanceOf(human), humanBefore + STAKE);
        assertEq(usdg.balanceOf(boss), bossBefore + STAKE);
    }

    function test_cancelUnjoinedRound() public {
        uint256 roundId = _createAs(human, humanIdx, humanWeights, HUMAN_SALT, address(0));
        uint256 humanBefore = usdg.balanceOf(human);
        vm.prank(human);
        battle.cancelRound(roundId);
        assertEq(usdg.balanceOf(human), humanBefore + STAKE);
    }

    function test_revert_joinAfterWindow() public {
        uint256 roundId = _createAs(human, humanIdx, humanWeights, HUMAN_SALT, address(0));
        vm.warp(block.timestamp + battle.JOIN_WINDOW() + 1);
        _postFlat(100e18, true); // keep prices fresh so it's the window that trips
        vm.prank(boss);
        vm.expectRevert(Battle.TooLate.selector);
        battle.joinRound(roundId, bytes32(uint256(1)));
    }

    // ---------------------------------------------------------- reveal validation

    function test_revert_wrongSaltReveal() public {
        uint256 roundId = _openRound();
        _closeRound(roundId, [uint192(110e18), 100e18, 100e18, 100e18, 100e18]);
        vm.prank(human);
        vm.expectRevert(Battle.BadCommit.selector);
        battle.reveal(roundId, humanIdx, humanWeights, 7, keccak256("wrong"));
    }

    function test_revert_duplicateTokenAllocation() public {
        uint8[3] memory dupIdx = [0, 0, 2];
        uint16[3] memory weights = [uint16(5000), 3000, 2000];
        uint256 roundId = _createAs(human, dupIdx, weights, HUMAN_SALT, address(0));
        _joinAs(boss, roundId, bossIdx, bossWeights, BOSS_SALT);
        _closeRound(roundId, [uint192(100e18), 100e18, 100e18, 100e18, 100e18]);

        vm.prank(human);
        vm.expectRevert(Battle.BadAllocation.selector);
        battle.reveal(roundId, dupIdx, weights, 7, HUMAN_SALT);
    }

    function test_revert_weightsNotSummingTo100() public {
        uint8[3] memory idx = [0, 1, 2];
        uint16[3] memory badWeights = [uint16(5000), 3000, 1000]; // 90%
        uint256 roundId = _createAs(human, idx, badWeights, HUMAN_SALT, address(0));
        _joinAs(boss, roundId, bossIdx, bossWeights, BOSS_SALT);
        _closeRound(roundId, [uint192(100e18), 100e18, 100e18, 100e18, 100e18]);

        vm.prank(human);
        vm.expectRevert(Battle.BadAllocation.selector);
        battle.reveal(roundId, idx, badWeights, 7, HUMAN_SALT);
    }

    function test_lockedOpponent_blocksStrangers() public {
        uint256 roundId = _createAs(human, humanIdx, humanWeights, HUMAN_SALT, boss);
        address stranger = address(0x300);
        usdg.mint(stranger, STAKE);
        vm.startPrank(stranger);
        usdg.approve(address(battle), STAKE);
        vm.expectRevert(Battle.NotParticipant.selector);
        battle.joinRound(roundId, bytes32(uint256(1)));
        vm.stopPrank();
    }

    function test_allTiersHaveCorrectDurations() public view {
        assertEq(battle.durationOf(Battle.Tier.OneMinute), 60);
        assertEq(battle.durationOf(Battle.Tier.FiveMinutes), 300);
        assertEq(battle.durationOf(Battle.Tier.FifteenMinutes), 900);
        assertEq(battle.durationOf(Battle.Tier.OneHour), 3600);
    }

    function test_revert_settleWithDriftedPrices() public {
        uint256 roundId = _openRound();
        _revealBoth(roundId);
        // Skip far past round end, then post fresh prices: observed long after
        // endTime. A losing player must not get to settle on these.
        vm.warp(block.timestamp + 61 + battle.MAX_PRICE_AGE() + 1);
        _postFlat(150e18, true);
        vm.expectRevert(Battle.StalePrice.selector);
        battle.settle(roundId);
    }

    function test_largeStakePayout_noTruncation() public {
        uint96 bigStake = type(uint96).max / 2; // pot = 2*stake > uint96 max range edge
        usdg.mint(human, bigStake);
        usdg.mint(boss, bigStake);

        bytes32 commit = battle.commitHash(battle.nextRoundId(), human, humanIdx, humanWeights, 7, HUMAN_SALT);
        vm.prank(human);
        uint256 roundId = battle.createRound(Battle.Tier.OneMinute, bigStake, commit, address(0));
        _joinAs(boss, roundId, bossIdx, bossWeights, BOSS_SALT);
        _closeRound(roundId, [uint192(110e18), 100e18, 100e18, 100e18, 100e18]); // human wins
        _revealBoth(roundId);

        uint256 humanBefore = usdg.balanceOf(human);
        battle.settle(roundId);
        assertEq(usdg.balanceOf(human), humanBefore + 2 * uint256(bigStake));
    }

    // ---------------------------------------------------- reveal-at-start

    /// @dev Both sides reveal while the round is still Running (before any
    /// snapshot), then it settles normally after end prices land.
    function test_revealDuringRunning_thenSettle() public {
        uint256 roundId = _openRound();
        // Reveal immediately — round is Running, no snapshot yet.
        vm.prank(human);
        battle.reveal(roundId, humanIdx, humanWeights, 7, HUMAN_SALT);
        vm.prank(boss);
        battle.reveal(roundId, bossIdx, bossWeights, 7, BOSS_SALT);

        Battle.Round memory mid = battle.getRound(roundId);
        assertTrue(mid.creatorHand.revealed);
        assertTrue(mid.opponentHand.revealed);
        assertEq(mid.creatorReturn, 0); // not computed until settle
        assertEq(uint8(mid.status), uint8(2)); // still Running

        // TSLA +10%: human (50% TSLA) beats boss (20% TSLA).
        vm.warp(block.timestamp + 61);
        _postPrices(stocks, [uint192(110e18), 100e18, 100e18, 100e18, 100e18], true);

        uint256 humanBefore = usdg.balanceOf(human);
        battle.settle(roundId); // one-shot: reads prices + pays, no snapshot
        assertEq(usdg.balanceOf(human), humanBefore + 2 * uint256(STAKE));
        assertEq(battle.humanWins(), 1);
    }

    function test_revert_revealBeforeRunning() public {
        // Round is Open (no opponent yet) — nothing to reveal against.
        uint256 roundId = _createAs(human, humanIdx, humanWeights, HUMAN_SALT, address(0));
        vm.prank(human);
        vm.expectRevert(Battle.BadStatus.selector);
        battle.reveal(roundId, humanIdx, humanWeights, 7, HUMAN_SALT);
    }

    function test_revert_doubleRevealDuringRunning() public {
        uint256 roundId = _openRound();
        vm.prank(human);
        battle.reveal(roundId, humanIdx, humanWeights, 7, HUMAN_SALT);
        vm.prank(human);
        vm.expectRevert(Battle.AlreadyRevealed.selector);
        battle.reveal(roundId, humanIdx, humanWeights, 7, HUMAN_SALT);
    }

    // ---------------------------------------------------------- shorts

    /// @dev Human shorts TSLA (leg 0 short => mask 0b110), boss stays long.
    function test_shortLegWins_whenPriceDrops() public {
        bytes32 commit = battle.commitHash(battle.nextRoundId(), human, humanIdx, humanWeights, 6, HUMAN_SALT);
        vm.prank(human);
        uint256 roundId = battle.createRound(Battle.Tier.OneMinute, STAKE, commit, address(0));
        _joinAs(boss, roundId, bossIdx, bossWeights, BOSS_SALT);
        // TSLA -20%: human's 50% short TSLA leg returns 1.2x weighted.
        _closeRound(roundId, [uint192(80e18), 100e18, 100e18, 100e18, 100e18]);

        vm.prank(human);
        battle.reveal(roundId, humanIdx, humanWeights, 6, HUMAN_SALT);
        vm.prank(boss);
        battle.reveal(roundId, bossIdx, bossWeights, 7, BOSS_SALT);

        uint256 humanBefore = usdg.balanceOf(human);
        battle.settle(roundId);
        assertEq(usdg.balanceOf(human), humanBefore + 2 * uint256(STAKE));

        Battle.Round memory round = battle.getRound(roundId);
        // 50% short TSLA at 0.8 => leg 1.2; 30% + 20% flat longs => 1.10 total
        assertEq(round.creatorReturn, 1.1e18);
    }

    /// @dev A short leg is wiped (0) when price >= 2x — never negative.
    function test_shortWipeout_clampsAtZero() public {
        bytes32 commit = battle.commitHash(battle.nextRoundId(), human, humanIdx, humanWeights, 6, HUMAN_SALT);
        vm.prank(human);
        uint256 roundId = battle.createRound(Battle.Tier.OneMinute, STAKE, commit, address(0));
        _joinAs(boss, roundId, bossIdx, bossWeights, BOSS_SALT);
        // TSLA 3x: human's 50% short leg wiped to 0, longs flat => 0.50 total.
        _closeRound(roundId, [uint192(300e18), 100e18, 100e18, 100e18, 100e18]);

        vm.prank(human);
        battle.reveal(roundId, humanIdx, humanWeights, 6, HUMAN_SALT);
        vm.prank(boss);
        battle.reveal(roundId, bossIdx, bossWeights, 7, BOSS_SALT);
        battle.settle(roundId);

        Battle.Round memory round = battle.getRound(roundId);
        assertEq(round.creatorReturn, 0.5e18);
        // Boss held 20% TSLA long at 3x => 1.0*0.8 + 3.0*0.2 = 1.40; boss wins.
        assertEq(round.opponentReturn, 1.4e18);
    }

    /// @dev Mask must match the commitment — flipping a direction is a BadCommit.
    function test_revert_revealWithFlippedDirection() public {
        uint256 roundId = _openRound(); // committed all-long (7)
        _closeRound(roundId, [uint192(100e18), 100e18, 100e18, 100e18, 100e18]);
        vm.prank(human);
        vm.expectRevert(Battle.BadCommit.selector);
        battle.reveal(roundId, humanIdx, humanWeights, 6, HUMAN_SALT);
    }

    // ---------------------------------------------------------- fuzz

    function testFuzz_settlementNeverMintsOrBurns(uint192 p0, uint192 p1, uint192 p2) public {
        p0 = uint192(bound(p0, 1e15, 1e24));
        p1 = uint192(bound(p1, 1e15, 1e24));
        p2 = uint192(bound(p2, 1e15, 1e24));

        uint256 totalBefore = usdg.balanceOf(human) + usdg.balanceOf(boss);
        uint256 roundId = _openRound();
        _closeRound(roundId, [p0, p1, p2, 100e18, 100e18]);
        _revealBoth(roundId);
        battle.settle(roundId);

        assertEq(usdg.balanceOf(human) + usdg.balanceOf(boss), totalBefore);
        assertEq(usdg.balanceOf(address(battle)), 0);
    }
}
