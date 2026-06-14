// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PriceRelay} from "../src/PriceRelay.sol";
import {Battle} from "../src/Battle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IPriceRelay} from "../src/interfaces/IPriceRelay.sol";

/// @notice Crypto mode (24/7): a second relay + Battle reusing the same code.
/// The 5 "tokens" are virtual price-keys (BTC/ETH/BNB/SOL/XRP) — no real
/// crypto tokens exist on this testnet, and player allocations are virtual,
/// so the addresses only ever serve as relay lookup keys.
contract DeployCrypto is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address relaySigner = vm.envAddress("RELAY_SIGNER");
        address bossAddress = vm.envAddress("BOSS_ADDRESS");
        address usdg = 0x7E955252E15c84f5768B83c41a71F9eba181802F;

        address[5] memory cryptoKeys = [
            0x69c88A0Ec0266c9Ab7450454Ef33c541420F9ce2, // BTC
            0x6cD32d64CCE33753D905CD95b7Cf5d822F566dDF, // ETH
            0xCD02e4444900Fc9D3d2Ad0729c7c6d72aFF20DFd, // BNB
            0x7f1985ADf8D2e09Ebc3A193D1a832130d4f29a40, // SOL
            0xCccb6536d8FEE02776f847fDa40A5Ce3a827e43D  // XRP
        ];

        vm.startBroadcast(deployerKey);
        PriceRelay cryptoRelay = new PriceRelay(relaySigner);
        Battle cryptoBattle = new Battle(IERC20(usdg), IPriceRelay(address(cryptoRelay)), cryptoKeys, bossAddress);
        vm.stopBroadcast();

        console.log("CryptoRelay: ", address(cryptoRelay));
        console.log("CryptoBattle:", address(cryptoBattle));
    }
}
