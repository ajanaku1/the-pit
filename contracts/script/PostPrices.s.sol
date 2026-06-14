// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PriceRelay} from "../src/PriceRelay.sol";
import {IPriceRelay} from "../src/interfaces/IPriceRelay.sol";

interface ISwapRouter {
    function quoteTokenForUSDG(address token, uint256 tokenIn) external view returns (uint256);
}

/// @notice Keeper-in-a-script: quotes all 5 stocks on the testnet SwapRouter,
/// signs reports with PRIVATE_KEY (must be an authorized relay signer), posts.
/// Env: PRIVATE_KEY, RELAY (deployed PriceRelay), optional MARKET_OPEN (default true).
contract PostPrices is Script {
    address constant ROUTER = 0x2953A82d44fDACfa7a49BfFF24f7Cc5879F10805;

    function run() external {
        uint256 signerKey = vm.envUint("PRIVATE_KEY");
        PriceRelay relay = PriceRelay(vm.envAddress("RELAY"));
        bool marketOpen = vm.envOr("MARKET_OPEN", true);

        address[5] memory tokens = [
            0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E, // TSLA
            0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02, // AMZN
            0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0, // PLTR
            0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93, // NFLX
            0x71178BAc73cBeb415514eB542a8995b82669778d  // AMD
        ];

        bytes[] memory reports = new bytes[](5);
        for (uint256 i = 0; i < 5; i++) {
            // Router quotes 1 whole token in USDG (6 decimals) -> scale to 1e18.
            uint256 usdgOut = ISwapRouter(ROUTER).quoteTokenForUSDG(tokens[i], 1e18);
            uint192 price = uint192(usdgOut * 1e12);
            IPriceRelay.PriceReport memory report =
                IPriceRelay.PriceReport(tokens[i], price, uint32(block.timestamp), marketOpen);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, relay.reportDigest(report));
            reports[i] = abi.encode(report, abi.encodePacked(r, s, v));
            console.log("price %s: %s", i, price);
        }

        vm.startBroadcast(signerKey);
        relay.postReports(reports);
        vm.stopBroadcast();
    }
}
