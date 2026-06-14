// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IStock} from "./interfaces/IStock.sol";
import {IPriceRelay} from "./interfaces/IPriceRelay.sol";

/// @title BossVault — the Pit Boss's real, public stock-token portfolio
/// @notice The only contract that holds real stock tokens. Valuation reads
/// each Stock's effective uiMultiplier so corporate actions (splits etc.)
/// don't distort the agent's track record.
contract BossVault {
    address public owner; // the agent

    IPriceRelay public immutable relay;
    address[5] public tokens;

    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    error NotOwner();
    error TransferFailed();
    error UnknownToken();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(IPriceRelay relay_, address[5] memory tokens_) {
        owner = msg.sender;
        relay = relay_;
        tokens = tokens_;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Deposits are plain ERC-20 transfers to this address; no hook needed.

    function withdraw(address token, address to, uint256 amount) external onlyOwner {
        if (!IERC20(token).transfer(to, amount)) revert TransferFailed();
        emit Withdrawn(token, to, amount);
    }

    /// @dev Multiplier in force right now: newUIMultiplier once effectiveAt passes.
    function effectiveMultiplier(IStock stock) public view returns (uint256) {
        uint256 effectiveAt = stock.effectiveAt();
        if (effectiveAt != 0 && block.timestamp >= effectiveAt) {
            return stock.newUIMultiplier();
        }
        return stock.uiMultiplier();
    }

    /// @notice USD value (18 decimals) of one held stock position,
    /// multiplier-adjusted: balance * uiMultiplier * price.
    function positionValue(address token) public view returns (uint256) {
        IStock stock = IStock(token);
        uint256 balance = stock.balanceOf(address(this));
        if (balance == 0) return 0;
        (uint192 price,) = relay.getPrice(token);
        uint256 multiplier = effectiveMultiplier(stock);
        uint8 tokenDecimals = stock.decimals();
        // balance(dec) * multiplier(1e18) * price(1e18) -> 1e18 USD
        return (balance * multiplier / 1e18) * price / (10 ** tokenDecimals);
    }

    /// @notice Total portfolio value in USD (18 decimals) across all 5 stocks.
    /// Paused tokens still count — pause halts transfers, not ownership.
    function totalValue() external view returns (uint256 total) {
        for (uint256 i = 0; i < 5; i++) {
            total += positionValue(tokens[i]);
        }
    }
}
