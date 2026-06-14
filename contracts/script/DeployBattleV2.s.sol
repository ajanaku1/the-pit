// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Battle} from "../src/Battle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IPriceRelay} from "../src/interfaces/IPriceRelay.sol";

contract DeployBattleV2 is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address relay = vm.envAddress("RELAY");
        address bossAddress = vm.envAddress("BOSS_ADDRESS");
        address usdg = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
        address[5] memory tokens = [
            0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E,
            0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02,
            0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0,
            0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93,
            0x71178BAc73cBeb415514eB542a8995b82669778d
        ];
        vm.startBroadcast(deployerKey);
        Battle battle = new Battle(IERC20(usdg), IPriceRelay(relay), tokens, bossAddress);
        vm.stopBroadcast();
        console.log("Battle v2:", address(battle));
    }
}
