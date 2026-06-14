// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceRelay} from "./interfaces/IPriceRelay.sol";

/// @title PriceRelay — signed-report price store for The Pit
/// @notice Self-signed fallback implementation of the Data Streams-shaped
/// relay. An authorized signer (the agent keeper) signs report payloads
/// off-chain; anyone may post them. Swapping in a real Chainlink verifier
/// means replacing _verify() only — the IPriceRelay surface is frozen.
contract PriceRelay is IPriceRelay {
    struct StoredPrice {
        uint192 price;
        uint32 observedAt;
    }

    address public owner;
    mapping(address => bool) public isSigner;
    mapping(address => StoredPrice) internal prices;
    bool internal marketOpen;
    uint32 public marketStatusUpdatedAt;

    event ReportPosted(address indexed token, uint192 price, uint32 observedAt, bool marketOpen);
    event SignerSet(address indexed signer, bool allowed);

    error NotOwner();
    error InvalidSignature();
    error StaleReport();
    error NoPrice();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address initialSigner) {
        owner = msg.sender;
        isSigner[initialSigner] = true;
        emit SignerSet(initialSigner, true);
    }

    function setSigner(address signer, bool allowed) external onlyOwner {
        isSigner[signer] = allowed;
        emit SignerSet(signer, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice signedReport = abi.encode(PriceReport, bytes signature) where
    /// signature is an eth_sign-style ECDSA sig over keccak256(abi.encode(report)).
    function postReports(bytes[] calldata signedReports) external {
        for (uint256 i = 0; i < signedReports.length; i++) {
            (PriceReport memory report, bytes memory sig) =
                abi.decode(signedReports[i], (PriceReport, bytes));
            _verify(report, sig);

            StoredPrice storage stored = prices[report.token];
            // Monotonic per-token: never let an older report overwrite a newer one.
            if (report.observationsTimestamp <= stored.observedAt) revert StaleReport();

            stored.price = report.price;
            stored.observedAt = report.observationsTimestamp;

            if (report.observationsTimestamp >= marketStatusUpdatedAt) {
                marketOpen = report.marketOpen;
                marketStatusUpdatedAt = report.observationsTimestamp;
            }
            emit ReportPosted(report.token, report.price, report.observationsTimestamp, report.marketOpen);
        }
    }

    function getPrice(address token) external view returns (uint192, uint32) {
        StoredPrice memory stored = prices[token];
        if (stored.observedAt == 0) revert NoPrice();
        return (stored.price, stored.observedAt);
    }

    /// @dev Status older than the TTL reads as closed: if the keeper dies at
    /// Friday open, rounds must not stay openable all weekend.
    uint256 public constant MARKET_STATUS_TTL = 10 minutes;

    function isMarketOpen() external view returns (bool) {
        return marketOpen && block.timestamp <= uint256(marketStatusUpdatedAt) + MARKET_STATUS_TTL;
    }

    /// @notice Digest a report must be signed over: domain-separated by chain
    /// and relay address so reports cannot replay across deployments.
    function reportDigest(PriceReport memory report) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encode(block.chainid, address(this), report))
            )
        );
    }

    function _verify(PriceReport memory report, bytes memory sig) internal view {
        if (sig.length != 65) revert InvalidSignature();
        bytes32 digest = reportDigest(report);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        // Reject malleable signatures (high-s) per EIP-2.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert InvalidSignature();
        }
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || !isSigner[recovered]) revert InvalidSignature();
    }
}
