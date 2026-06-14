// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IPriceRelay} from "./interfaces/IPriceRelay.sol";

/// @title Battle — commit-reveal portfolio duels on tokenized stocks
/// @notice Two players stake USDG and commit hidden virtual allocations
/// (3 of 5 stock tokens, weights summing to 100%). No swaps happen;
/// settlement compares oracle price ratios between round start and end.
/// @dev Reveal-at-start: both sides commit blind, then reveal their picks
/// the moment the round is live (Running) so the duel can be watched live.
/// The blind counter-draft — the point of commit-reveal — is preserved:
/// the opponent commits before anyone reveals, so it cannot copy a hand.
contract Battle {
    enum Tier {
        OneMinute,
        FiveMinutes,
        FifteenMinutes,
        OneHour
    }

    enum Status {
        None,
        Open,        // creator committed + staked, waiting for opponent
        Running,     // both committed, start prices locked, reveal open
        Snapshotted, // deprecated (kept for enum-index stability); never set in v4
        Settled,
        Cancelled
    }

    /// @dev A revealed allocation, stored publicly once declared.
    struct Hand {
        uint8[3] tokenIdx;
        uint16[3] weightsBps;
        uint8 longMask;     // bit i set = leg i long; cleared = short
        bool revealed;
    }

    struct Round {
        address creator;
        address opponent;     // address(0) while Open and unrestricted
        uint96 stake;         // per-side USDG stake
        Tier tier;
        Status status;
        uint40 createdAt;
        uint40 startTime;
        uint40 endTime;
        uint40 snapshotTime;
        bytes32 creatorCommit;
        bytes32 opponentCommit;
        uint192[5] startPrices;
        uint192[5] endPrices;
        Hand creatorHand;       // picks revealed during the round
        Hand opponentHand;
        uint256 creatorReturn;  // 1e18-scaled, computed at settle
        uint256 opponentReturn;
    }

    uint256 public constant WEIGHT_TOTAL_BPS = 10_000;
    uint256 public constant MAX_PRICE_AGE = 5 minutes;   // freshness bound for relay prices
    uint256 public constant JOIN_WINDOW = 10 minutes;    // opponent must commit within this
    uint256 public constant REVEAL_GRACE = 45 seconds;   // after the bell, before a non-revealer forfeits
    uint256 public constant SETTLE_DEADLINE = 1 hours;   // after endTime; past it, refund

    IERC20 public immutable usdg;
    IPriceRelay public immutable relay;
    address public immutable boss; // the AI opponent, for the leaderboard

    address[5] public tokens;
    uint256 public nextRoundId = 1;
    mapping(uint256 => Round) internal rounds;

    // Humans vs. The Machine running score (only rounds involving the boss).
    uint256 public humanWins;
    uint256 public machineWins;
    uint256 public drawCount;
    mapping(address => uint256) public winsOf;

    event RoundCreated(uint256 indexed roundId, address indexed creator, Tier tier, uint96 stake, address opponent);
    event RoundJoined(uint256 indexed roundId, address indexed opponent, uint40 startTime, uint40 endTime);
    event Revealed(uint256 indexed roundId, address indexed player);
    event RoundSettled(uint256 indexed roundId, address winner, uint256 payout); // winner=0 => split
    event RoundCancelled(uint256 indexed roundId);

    error MarketClosed();
    error StalePrice();
    error BadStatus();
    error BadCommit();
    error BadAllocation();
    error NotParticipant();
    error TooEarly();
    error TooLate();
    error TransferFailed();
    error AlreadyRevealed();

    constructor(IERC20 usdg_, IPriceRelay relay_, address[5] memory tokens_, address boss_) {
        usdg = usdg_;
        relay = relay_;
        tokens = tokens_;
        boss = boss_;
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function durationOf(Tier tier) public pure returns (uint256) {
        if (tier == Tier.OneMinute) return 1 minutes;
        if (tier == Tier.FiveMinutes) return 5 minutes;
        if (tier == Tier.FifteenMinutes) return 15 minutes;
        return 1 hours;
    }

    /// @notice Commit hash format, identical for both sides:
    /// keccak256(abi.encode(roundId, player, tokenIdx, weightsBps, longMask, salt))
    /// @param longMask bit i set = leg i is long; cleared = short
    function commitHash(
        uint256 roundId,
        address player,
        uint8[3] memory tokenIdx,
        uint16[3] memory weightsBps,
        uint8 longMask,
        bytes32 salt
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(roundId, player, tokenIdx, weightsBps, longMask, salt));
    }

    /// @param opponent address(0) lets anyone join; set to lock a specific foe
    function createRound(Tier tier, uint96 stake, bytes32 commit, address opponent)
        external
        returns (uint256 roundId)
    {
        if (stake == 0 || commit == bytes32(0)) revert BadCommit();
        _requireMarketLive();

        roundId = nextRoundId++;
        Round storage round = rounds[roundId];
        round.creator = msg.sender;
        round.opponent = opponent;
        round.stake = stake;
        round.tier = tier;
        round.status = Status.Open;
        round.createdAt = uint40(block.timestamp);
        round.creatorCommit = commit;

        emit RoundCreated(roundId, msg.sender, tier, stake, opponent);
        _pull(msg.sender, stake);
    }

    function joinRound(uint256 roundId, bytes32 commit) external {
        Round storage round = rounds[roundId];
        if (round.status != Status.Open) revert BadStatus();
        if (round.opponent != address(0) && round.opponent != msg.sender) revert NotParticipant();
        if (msg.sender == round.creator) revert NotParticipant();
        if (block.timestamp > round.createdAt + JOIN_WINDOW) revert TooLate();
        if (commit == bytes32(0)) revert BadCommit();
        _requireMarketLive();

        round.opponent = msg.sender;
        round.opponentCommit = commit;
        round.status = Status.Running;
        round.startTime = uint40(block.timestamp);
        round.endTime = uint40(block.timestamp + durationOf(round.tier));
        round.startPrices = _readFreshPrices();

        emit RoundJoined(roundId, msg.sender, round.startTime, round.endTime);
        _pull(msg.sender, round.stake);
    }

    /// @notice Creator can walk away if nobody joined in time.
    function cancelRound(uint256 roundId) external {
        Round storage round = rounds[roundId];
        if (round.status != Status.Open) revert BadStatus();
        if (msg.sender != round.creator) revert NotParticipant();
        round.status = Status.Cancelled;
        emit RoundCancelled(roundId);
        _push(round.creator, round.stake);
    }

    /// @notice Escape hatch: relay died and no fresh price landed in time —
    /// both sides get their stake back.
    function refundStale(uint256 roundId) external {
        Round storage round = rounds[roundId];
        if (round.status != Status.Running) revert BadStatus();
        if (block.timestamp <= round.endTime + SETTLE_DEADLINE) revert TooEarly();
        round.status = Status.Cancelled;
        emit RoundCancelled(roundId);
        _push(round.creator, round.stake);
        _push(round.opponent, round.stake);
    }

    /// @notice Declare your picks. Callable the instant the round is live
    /// (Running) so both hands can be watched racing, up until the round
    /// settles. Stores picks; returns are computed at settle.
    function reveal(
        uint256 roundId,
        uint8[3] calldata tokenIdx,
        uint16[3] calldata weightsBps,
        uint8 longMask,
        bytes32 salt
    ) external {
        Round storage round = rounds[roundId];
        if (round.status != Status.Running) revert BadStatus();

        bytes32 expected;
        bool isCreator = msg.sender == round.creator;
        if (isCreator) {
            if (round.creatorHand.revealed) revert AlreadyRevealed();
            expected = round.creatorCommit;
        } else if (msg.sender == round.opponent) {
            if (round.opponentHand.revealed) revert AlreadyRevealed();
            expected = round.opponentCommit;
        } else {
            revert NotParticipant();
        }

        if (commitHash(roundId, msg.sender, tokenIdx, weightsBps, longMask, salt) != expected) revert BadCommit();
        _validateAllocation(tokenIdx, weightsBps);

        Hand storage hand = isCreator ? round.creatorHand : round.opponentHand;
        hand.tokenIdx = tokenIdx;
        hand.weightsBps = weightsBps;
        hand.longMask = longMask;
        hand.revealed = true;
        emit Revealed(roundId, msg.sender);
    }

    /// @notice One-shot settle: reads fresh end prices, computes returns from
    /// the revealed hands, and pays out — no separate snapshot step. Callable
    /// once the bell has rung and the relay holds a price observed at/after it.
    function settle(uint256 roundId) external {
        Round storage round = rounds[roundId];
        if (round.status != Status.Running) revert BadStatus();
        if (block.timestamp < round.endTime) revert TooEarly();
        if (block.timestamp > round.endTime + SETTLE_DEADLINE) revert TooLate();

        bool creatorIn = round.creatorHand.revealed;
        bool opponentIn = round.opponentHand.revealed;
        // Both revealed (the normal case) settles the instant the bell rings.
        // Otherwise give a slow revealer a short grace before they forfeit.
        if (!(creatorIn && opponentIn) && block.timestamp < uint256(round.endTime) + REVEAL_GRACE) {
            revert TooEarly();
        }

        // Lock end-of-round prices: observed at/after the bell, close to it —
        // otherwise a losing player could wait for prices to drift their way.
        uint192[5] memory endPrices;
        for (uint256 i = 0; i < 5; i++) {
            (uint192 price, uint32 observedAt) = relay.getPrice(tokens[i]);
            if (observedAt < round.endTime) revert StalePrice();
            if (observedAt > uint256(round.endTime) + MAX_PRICE_AGE) revert StalePrice();
            endPrices[i] = price;
        }
        round.endPrices = endPrices;
        round.snapshotTime = uint40(block.timestamp);
        round.status = Status.Settled;
        uint256 pot = uint256(round.stake) * 2;

        if (creatorIn) round.creatorReturn = _portfolioReturn(round, round.creatorHand);
        if (opponentIn) round.opponentReturn = _portfolioReturn(round, round.opponentHand);

        address winner;
        if (creatorIn && opponentIn) {
            if (round.creatorReturn > round.opponentReturn) winner = round.creator;
            else if (round.opponentReturn > round.creatorReturn) winner = round.opponent;
            // equal => exact tie, winner stays address(0)
        } else if (creatorIn) {
            winner = round.creator; // opponent failed to reveal => forfeit
        } else if (opponentIn) {
            winner = round.opponent;
        }
        // neither revealed => mutual no-show, split refund (winner = 0)

        if (winner == address(0)) {
            _recordResult(round, address(0));
            emit RoundSettled(roundId, address(0), round.stake);
            _push(round.creator, round.stake);
            _push(round.opponent, round.stake);
        } else {
            _recordResult(round, winner);
            emit RoundSettled(roundId, winner, pot);
            _push(winner, pot);
        }
    }

    // ---------------------------------------------------------------- internal

    function _recordResult(Round storage round, address winner) internal {
        bool bossInvolved = round.creator == boss || round.opponent == boss;
        if (winner == address(0)) {
            if (bossInvolved) drawCount++;
            return;
        }
        winsOf[winner]++;
        if (!bossInvolved) return;
        if (winner == boss) machineWins++;
        else humanWins++;
    }

    function _validateAllocation(uint8[3] calldata tokenIdx, uint16[3] calldata weightsBps) internal pure {
        uint256 total;
        for (uint256 i = 0; i < 3; i++) {
            if (tokenIdx[i] >= 5 || weightsBps[i] == 0) revert BadAllocation();
            total += weightsBps[i];
        }
        if (tokenIdx[0] == tokenIdx[1] || tokenIdx[0] == tokenIdx[2] || tokenIdx[1] == tokenIdx[2]) {
            revert BadAllocation();
        }
        if (total != WEIGHT_TOTAL_BPS) revert BadAllocation();
    }

    /// @dev Weighted sum of leg ratios, 1e18-scaled. 1e18 = flat.
    /// Long leg: end/start. Short leg: inverse exposure 2e18 - ratio,
    /// clamped at 0 — a doubling wipes the short, it cannot go negative.
    /// Clamped to a 1 wei floor so a (vanishingly unlikely) true-zero return
    /// can't read as the unrevealed state to any consumer.
    function _portfolioReturn(Round storage round, Hand storage hand) internal view returns (uint256 total) {
        for (uint256 i = 0; i < 3; i++) {
            uint256 idx = hand.tokenIdx[i];
            uint256 ratio = (uint256(round.endPrices[idx]) * 1e18) / round.startPrices[idx];
            if (hand.longMask & (1 << i) == 0) {
                ratio = ratio >= 2e18 ? 0 : 2e18 - ratio;
            }
            total += (ratio * hand.weightsBps[i]) / WEIGHT_TOTAL_BPS;
        }
        if (total == 0) total = 1;
    }

    function _requireMarketLive() internal view {
        if (!relay.isMarketOpen()) revert MarketClosed();
    }

    function _readFreshPrices() internal view returns (uint192[5] memory startPrices) {
        for (uint256 i = 0; i < 5; i++) {
            (uint192 price, uint32 observedAt) = relay.getPrice(tokens[i]);
            if (block.timestamp > uint256(observedAt) + MAX_PRICE_AGE) revert StalePrice();
            if (price == 0) revert StalePrice();
            startPrices[i] = price;
        }
    }

    function _pull(address from, uint256 amount) internal {
        if (!usdg.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        if (!usdg.transfer(to, amount)) revert TransferFailed();
    }
}
