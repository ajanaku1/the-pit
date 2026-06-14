// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice FROZEN INTERFACE — consumers (Battle, BossVault, agent keeper) bind
/// to this. The implementation behind it can be the self-signed relay or a
/// Chainlink Data Streams verifier adapter without consumers changing.
interface IPriceRelay {
    /// @dev Mirrors the shape of a Chainlink Data Streams report payload.
    struct PriceReport {
        address token;                 // stock token this price quotes
        uint192 price;                 // USD price, 18 decimals
        uint32 observationsTimestamp;  // when the price was observed
        bool marketOpen;               // US equity market status at observation
    }

    /// @return price 18-decimal USD price
    /// @return observedAt timestamp the price was observed
    function getPrice(address token) external view returns (uint192 price, uint32 observedAt);

    /// @notice Latest known US equity market status.
    function isMarketOpen() external view returns (bool);

    /// @notice Verify and store signed price reports (keeper entrypoint).
    function postReports(bytes[] calldata signedReports) external;
}
