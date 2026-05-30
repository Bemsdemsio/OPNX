// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract InsuranceFund is Ownable {
    IERC20 public usdc;
    address public perpEngine;

    event BadDebtCovered(address indexed trader, uint256 amount);
    event PerpEngineSet(address indexed engine);

    modifier onlyPerpEngine() {
        require(msg.sender == perpEngine, "Only PerpEngine");
        _;
    }

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    function setPerpEngine(address _perpEngine) external onlyOwner {
        perpEngine = _perpEngine;
        emit PerpEngineSet(_perpEngine);
    }

    function coverBadDebt(address trader, uint256 amount) external onlyPerpEngine {
        uint256 balance = usdc.balanceOf(address(this));
        uint256 coverAmount = amount > balance ? balance : amount;
        if (coverAmount > 0) {
            usdc.transfer(perpEngine, coverAmount);
            emit BadDebtCovered(trader, coverAmount);
        }
    }
}
