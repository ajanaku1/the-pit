// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RelayHelper} from "./Helpers.sol";
import {BossVault} from "../src/BossVault.sol";
import {MockStock} from "./Mocks.sol";

contract BossVaultTest is RelayHelper {
    BossVault vault;
    MockStock tsla;
    address[5] stocks;

    function setUp() public {
        vm.warp(1_750_000_000);
        _setUpRelay();
        tsla = new MockStock("TSLA");
        stocks[0] = address(tsla);
        for (uint256 i = 1; i < 5; i++) {
            stocks[i] = address(new MockStock("STK"));
        }
        vault = new BossVault(relay, stocks);

        uint192[5] memory prices = [uint192(200e18), 100e18, 100e18, 100e18, 100e18];
        _postPrices(stocks, prices, true);
    }

    function test_positionValue_baseMultiplier() public {
        tsla.mint(address(vault), 10e18); // 10 TSLA @ $200, 1x multiplier
        assertEq(vault.positionValue(address(tsla)), 2000e18);
    }

    function test_positionValue_pendingMultiplierNotYetEffective() public {
        tsla.mint(address(vault), 10e18);
        tsla.scheduleMultiplier(2e18, block.timestamp + 1 days); // 2:1 split tomorrow
        assertEq(vault.positionValue(address(tsla)), 2000e18); // still 1x today
    }

    function test_positionValue_multiplierAfterEffectiveAt() public {
        tsla.mint(address(vault), 10e18);
        tsla.scheduleMultiplier(2e18, block.timestamp + 1 days);
        vm.warp(block.timestamp + 1 days + 1);
        // 2x multiplier now in force: 10 * 2 * $200 = $4000
        assertEq(vault.positionValue(address(tsla)), 4000e18);
    }

    function test_totalValue_sumsAllPositions() public {
        tsla.mint(address(vault), 10e18);                  // $2000
        MockStock(stocks[1]).mint(address(vault), 5e18);   // $500
        assertEq(vault.totalValue(), 2500e18);
    }

    function test_totalValue_skipsEmptyPositions() public view {
        assertEq(vault.totalValue(), 0); // no NoPrice revert, no phantom value
    }

    function test_withdraw_ownerOnly() public {
        tsla.mint(address(vault), 10e18);
        vault.withdraw(address(tsla), address(this), 4e18);
        assertEq(tsla.balanceOf(address(this)), 4e18);

        vm.prank(address(0xBEEF));
        vm.expectRevert(BossVault.NotOwner.selector);
        vault.withdraw(address(tsla), address(0xBEEF), 1e18);
    }
}
