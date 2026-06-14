// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PriceRelay} from "../src/PriceRelay.sol";
import {Battle} from "../src/Battle.sol";
import {BossVault} from "../src/BossVault.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/// @notice Deploys the full Pit stack to Robinhood Chain testnet.
/// Required env: PRIVATE_KEY (deployer), RELAY_SIGNER (keeper address),
/// BOSS_ADDRESS (agent wallet). Token addresses default to the verified
/// testnet set; override via env if they ever rotate.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address relaySigner = vm.envAddress("RELAY_SIGNER");
        address bossAddress = vm.envAddress("BOSS_ADDRESS");

        address usdg = vm.envOr("USDG", 0x7E955252E15c84f5768B83c41a71F9eba181802F);
        address[5] memory tokens = [
            vm.envOr("TSLA", 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E),
            vm.envOr("AMZN", 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02),
            vm.envOr("PLTR", 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0),
            vm.envOr("NFLX", 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93),
            vm.envOr("AMD", 0x71178BAc73cBeb415514eB542a8995b82669778d)
        ];

        vm.startBroadcast(deployerKey);
        PriceRelay relay = new PriceRelay(relaySigner);
        Battle battle = new Battle(IERC20(usdg), relay, tokens, bossAddress);
        BossVault vault = new BossVault(relay, tokens);
        vm.stopBroadcast();

        console.log("PriceRelay:", address(relay));
        console.log("Battle:    ", address(battle));
        console.log("BossVault: ", address(vault));
    }
}
