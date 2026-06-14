// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Battle} from "../src/Battle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IPriceRelay} from "../src/interfaces/IPriceRelay.sol";

/// @notice Redeploy both Battle contracts (reveal-at-start) against the
/// existing relays. Env: PRIVATE_KEY, RELAY, CRYPTO_RELAY, BOSS_ADDRESS.
contract DeployBattlesV3 is Script {
    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address relay = vm.envAddress("RELAY");
        address cryptoRelay = vm.envAddress("CRYPTO_RELAY");
        address boss = vm.envAddress("BOSS_ADDRESS");

        address[5] memory stocks = [
            0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E,
            0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02,
            0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0,
            0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93,
            0x71178BAc73cBeb415514eB542a8995b82669778d
        ];
        address[5] memory crypto = [
            0x69c88A0Ec0266c9Ab7450454Ef33c541420F9ce2,
            0x6cD32d64CCE33753D905CD95b7Cf5d822F566dDF,
            0xCD02e4444900Fc9D3d2Ad0729c7c6d72aFF20DFd,
            0x7f1985ADf8D2e09Ebc3A193D1a832130d4f29a40,
            0xCccb6536d8FEE02776f847fDa40A5Ce3a827e43D
        ];

        vm.startBroadcast(deployerKey);
        Battle stocksBattle = new Battle(IERC20(USDG), IPriceRelay(relay), stocks, boss);
        Battle cryptoBattle = new Battle(IERC20(USDG), IPriceRelay(cryptoRelay), crypto, boss);
        vm.stopBroadcast();

        console.log("StocksBattle v3:", address(stocksBattle));
        console.log("CryptoBattle v3:", address(cryptoBattle));
    }
}
