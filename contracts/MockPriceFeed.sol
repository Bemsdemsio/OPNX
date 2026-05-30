// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MockPriceFeed is Ownable {
    uint256 private _price; // 1e18 precision
    uint256 public lastUpdated;

    event PriceUpdated(uint256 newPrice, uint256 timestamp);

    constructor(uint256 initialPrice) Ownable(msg.sender) {
        _price = initialPrice;
        lastUpdated = block.timestamp;
    }

    function updatePrice(uint256 newPrice) external onlyOwner {
        _price = newPrice;
        lastUpdated = block.timestamp;
        emit PriceUpdated(newPrice, block.timestamp);
    }

    function getPrice() external view returns (uint256) {
        return _price;
    }
}
