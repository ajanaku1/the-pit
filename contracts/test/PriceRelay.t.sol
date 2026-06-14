// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RelayHelper} from "./Helpers.sol";
import {PriceRelay} from "../src/PriceRelay.sol";
import {IPriceRelay} from "../src/interfaces/IPriceRelay.sol";

contract PriceRelayTest is RelayHelper {
    address constant TSLA = address(0x1001);

    function setUp() public {
        _setUpRelay();
        vm.warp(1_750_000_000);
    }

    function _post(bytes memory report) internal {
        bytes[] memory reports = new bytes[](1);
        reports[0] = report;
        relay.postReports(reports);
    }

    function test_postAndRead() public {
        _post(_signedReport(TSLA, 200e18, uint32(block.timestamp), true));
        (uint192 price, uint32 observedAt) = relay.getPrice(TSLA);
        assertEq(price, 200e18);
        assertEq(observedAt, uint32(block.timestamp));
        assertTrue(relay.isMarketOpen());
    }

    function test_marketStatusFollowsNewestReport() public {
        _post(_signedReport(TSLA, 200e18, uint32(block.timestamp), true));
        vm.warp(block.timestamp + 60);
        _post(_signedReport(TSLA, 201e18, uint32(block.timestamp), false));
        assertFalse(relay.isMarketOpen());
    }

    function test_revert_olderReportRejected() public {
        _post(_signedReport(TSLA, 200e18, uint32(block.timestamp), true));
        bytes memory older = _signedReport(TSLA, 199e18, uint32(block.timestamp - 10), true);
        vm.expectRevert(PriceRelay.StaleReport.selector);
        _post(older);
    }

    function test_revert_unknownSigner() public {
        IPriceRelay.PriceReport memory report =
            IPriceRelay.PriceReport(TSLA, 200e18, uint32(block.timestamp), true);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, relay.reportDigest(report)); // not authorized
        vm.expectRevert(PriceRelay.InvalidSignature.selector);
        _post(abi.encode(report, abi.encodePacked(r, s, v)));
    }

    function test_revert_tamperedReport() public {
        bytes memory signed = _signedReport(TSLA, 200e18, uint32(block.timestamp), true);
        (IPriceRelay.PriceReport memory report, bytes memory sig) =
            abi.decode(signed, (IPriceRelay.PriceReport, bytes));
        report.price = 999e18; // tamper after signing
        vm.expectRevert(PriceRelay.InvalidSignature.selector);
        _post(abi.encode(report, sig));
    }

    function test_revert_noPriceForUnknownToken() public {
        vm.expectRevert(PriceRelay.NoPrice.selector);
        relay.getPrice(address(0xDEAD));
    }

    function test_revert_replayAcrossRelays() public {
        bytes memory signed = _signedReport(TSLA, 200e18, uint32(block.timestamp), true);
        PriceRelay otherRelay = new PriceRelay(signer); // same signer, different deployment
        bytes[] memory reports = new bytes[](1);
        reports[0] = signed;
        vm.expectRevert(PriceRelay.InvalidSignature.selector);
        otherRelay.postReports(reports);
    }

    function test_marketStatusExpiresAfterTtl() public {
        _post(_signedReport(TSLA, 200e18, uint32(block.timestamp), true));
        assertTrue(relay.isMarketOpen());
        vm.warp(block.timestamp + relay.MARKET_STATUS_TTL() + 1);
        assertFalse(relay.isMarketOpen()); // keeper died => fail closed
    }

    function test_signerManagement() public {
        bytes memory report = _signedReport(TSLA, 200e18, uint32(block.timestamp), true);
        relay.setSigner(signer, false);
        vm.expectRevert(PriceRelay.InvalidSignature.selector);
        _post(report);

        vm.prank(address(0xE0E)); // non-owner
        vm.expectRevert(PriceRelay.NotOwner.selector);
        relay.setSigner(address(3), true);
    }
}
