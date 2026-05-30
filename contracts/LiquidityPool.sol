// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LiquidityPool is ERC20, Ownable {
    IERC20 public usdc;
    address public perpEngine;

    event Deposit(address indexed user, uint256 amount, uint256 shares);
    event Withdraw(address indexed user, uint256 amount, uint256 shares);
    event PerpEngineSet(address indexed engine);

    modifier onlyPerpEngine() {
        require(msg.sender == perpEngine, "Only PerpEngine");
        _;
    }

    constructor(address _usdc) ERC20("OPN LP Share", "oLP") Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    function setPerpEngine(address _perpEngine) external onlyOwner {
        perpEngine = _perpEngine;
        emit PerpEngineSet(_perpEngine);
    }

    function totalAssets() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function deposit(uint256 amount) external returns (uint256) {
        require(amount > 0, "Amount must be > 0");
        uint256 assets = totalAssets();
        uint256 supply = totalSupply();
        
        usdc.transferFrom(msg.sender, address(this), amount);

        uint256 shares;
        if (supply == 0) {
            shares = amount;
        } else {
            shares = (amount * supply) / assets;
        }

        _mint(msg.sender, shares);
        emit Deposit(msg.sender, amount, shares);
        return shares;
    }

    function withdraw(uint256 shares) external returns (uint256) {
        require(shares > 0, "Shares must be > 0");
        uint256 assets = totalAssets();
        uint256 supply = totalSupply();
        require(balanceOf(msg.sender) >= shares, "Insufficient shares");

        uint256 amount = (shares * assets) / supply;
        _burn(msg.sender, shares);
        
        usdc.transfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount, shares);
        return amount;
    }

    // PerpEngine calls this to pay out winning traders
    function payTrader(address trader, uint256 amount) external onlyPerpEngine {
        require(totalAssets() >= amount, "Insufficient pool liquidity");
        usdc.transfer(trader, amount);
    }

    // PerpEngine calls this to deposit trader losses into the pool
    function collectTraderLoss(uint256 amount) external onlyPerpEngine {
        usdc.transferFrom(msg.sender, address(this), amount);
    }
}
