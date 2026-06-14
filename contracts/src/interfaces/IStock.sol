// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./IERC20.sol";

/// @notice Robinhood Chain tokenized-stock surface (BeaconProxy -> Stock impl).
/// uiMultiplier encodes corporate actions (splits etc.); newUIMultiplier takes
/// effect at effectiveAt. Multipliers are 18-decimal fixed point.
interface IStock is IERC20 {
    function uiMultiplier() external view returns (uint256);
    function newUIMultiplier() external view returns (uint256);
    function effectiveAt() external view returns (uint256);
    function tokenPaused() external view returns (bool);
}
