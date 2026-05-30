// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDC is ERC20, Ownable {
    constructor() ERC20("Mock USD Coin", "mUSDC") Ownable(msg.sender) {
        _mint(msg.sender, 10000000 * 10**decimals()); // Mint 10M to deployer
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
