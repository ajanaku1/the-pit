// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PriceRelay} from "../src/PriceRelay.sol";
import {IPriceRelay} from "../src/interfaces/IPriceRelay.sol";

/// @notice Shared signing + posting helpers for relay-backed tests.
abstract contract RelayHelper is Test {
    uint256 internal constant SIGNER_PK = 0xA11CE;
    address internal signer;
    PriceRelay internal relay;

    function _setUpRelay() internal {
        signer = vm.addr(SIGNER_PK);
        relay = new PriceRelay(signer);
    }

    function _signedReport(address token, uint192 price, uint32 observedAt, bool marketOpen)
        internal
        view
        returns (bytes memory)
    {
        IPriceRelay.PriceReport memory report =
            IPriceRelay.PriceReport(token, price, observedAt, marketOpen);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, relay.reportDigest(report));
        return abi.encode(report, abi.encodePacked(r, s, v));
    }

    /// @notice Post one signed report per token, observed now.
    function _postPrices(address[5] memory tokens, uint192[5] memory tokenPrices, bool marketOpen) internal {
        bytes[] memory reports = new bytes[](5);
        for (uint256 i = 0; i < 5; i++) {
            reports[i] = _signedReport(tokens[i], tokenPrices[i], uint32(block.timestamp), marketOpen);
        }
        relay.postReports(reports);
    }
}
