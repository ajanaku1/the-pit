// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IStock} from "../src/interfaces/IStock.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {BossVault} from "../src/BossVault.sol";
import {PriceRelay} from "../src/PriceRelay.sol";
import {IPriceRelay} from "../src/interfaces/IPriceRelay.sol";

/// @notice Fork tests against live Robinhood Chain testnet (chain 46630).
/// Run with: RUN_FORK_TESTS=true forge test --match-contract ForkTest
contract ForkTest is Test {
    address constant TSLA = 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E;
    address constant AMZN = 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02;
    address constant PLTR = 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0;
    address constant NFLX = 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93;
    address constant AMD = 0x71178BAc73cBeb415514eB542a8995b82669778d;
    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    string constant RPC = "https://rpc.testnet.chain.robinhood.com";

    bool forked;

    function setUp() public {
        if (!vm.envOr("RUN_FORK_TESTS", false)) return;
        vm.createSelectFork(vm.envOr("ROBINHOOD_RPC", string(RPC)));
        forked = true;
    }

    function _tokens() internal pure returns (address[5] memory) {
        return [TSLA, AMZN, PLTR, NFLX, AMD];
    }

    function test_chainId() public view {
        if (!forked) return;
        assertEq(block.chainid, 46630);
    }

    function test_stockSurface_allFiveTokens() public view {
        if (!forked) return;
        address[5] memory tokens = _tokens();
        for (uint256 i = 0; i < 5; i++) {
            IStock stock = IStock(tokens[i]);
            assertGt(stock.uiMultiplier(), 0);
            stock.newUIMultiplier();
            stock.effectiveAt();
            stock.tokenPaused();
            assertEq(stock.decimals(), 18);
        }
    }

    function test_usdgIsErc20() public view {
        if (!forked) return;
        IERC20(USDG).decimals();
        IERC20(USDG).balanceOf(address(this));
    }

    function test_bossVault_valuesLiveBalances() public {
        if (!forked) return;
        uint256 signerPk = 0xA11CE;
        PriceRelay relay = new PriceRelay(vm.addr(signerPk));

        bytes[] memory reports = new bytes[](5);
        address[5] memory tokens = _tokens();
        for (uint256 i = 0; i < 5; i++) {
            IPriceRelay.PriceReport memory report =
                IPriceRelay.PriceReport(tokens[i], 100e18, uint32(block.timestamp), true);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, relay.reportDigest(report));
            reports[i] = abi.encode(report, abi.encodePacked(r, s, v));
        }
        relay.postReports(reports);

        BossVault vault = new BossVault(relay, tokens);
        deal(TSLA, address(vault), 3e18); // forge `deal` writes balance slot
        uint256 multiplier = vault.effectiveMultiplier(IStock(TSLA));
        assertEq(vault.positionValue(TSLA), 3e18 * multiplier / 1e18 * 100);
    }
}
