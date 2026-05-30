// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MockUSDC.sol";
import "./MockPriceFeed.sol";
import "./LiquidityPool.sol";
import "./InsuranceFund.sol";
import "./FundingRate.sol";

contract PerpEngine is Ownable {
    struct Position {
        uint256 id;
        address trader;
        bool isLong;
        uint256 sizeUSDC; // 1e18 precision
        uint256 leverage; // 2 to 10
        uint256 margin;     // sizeUSDC / leverage (1e18 precision)
        uint256 entryPrice; // 1e18 precision
        int256 entryFunding; // 1e18 precision
        bool isActive;
    }

    MockUSDC public usdc;
    MockPriceFeed public priceFeed;
    LiquidityPool public liquidityPool;
    InsuranceFund public insuranceFund;
    FundingRate public fundingRateContract;

    uint256 public positionsCount;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) public userPositions;

    uint256 public longOI;
    uint256 public shortOI;

    uint256 public constant MIN_LEVERAGE = 2;
    uint256 public constant MAX_LEVERAGE = 10;
    uint256 public constant FEE_BPS = 10; // 0.1% fee (10 bps)
    uint256 public constant MAINTENANCE_MARGIN_BPS = 1000; // 10% of initial margin

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        bool isLong,
        uint256 sizeUSDC,
        uint256 leverage,
        uint256 entryPrice
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 payout,
        int256 pnl,
        uint256 exitPrice
    );

    event PositionLiquidated(
        uint256 indexed positionId,
        address indexed trader,
        address indexed liquidator,
        uint256 payout,
        int256 pnl
    );

    event MarginAdded(uint256 indexed positionId, address indexed trader, uint256 amount);

    constructor(
        address _usdc,
        address _priceFeed,
        address _liquidityPool,
        address _insuranceFund,
        address _fundingRate
    ) Ownable(msg.sender) {
        usdc = MockUSDC(_usdc);
        priceFeed = MockPriceFeed(_priceFeed);
        liquidityPool = LiquidityPool(_liquidityPool);
        insuranceFund = InsuranceFund(_insuranceFund);
        fundingRateContract = FundingRate(_fundingRate);
    }

    function openPosition(
        bool isLong,
        uint256 sizeUSDC,
        uint256 leverage
    ) external returns (uint256) {
        require(leverage >= MIN_LEVERAGE && leverage <= MAX_LEVERAGE, "Invalid leverage");
        require(sizeUSDC > 0, "Size must be > 0");

        uint256 margin = sizeUSDC / leverage;
        uint256 fee = (sizeUSDC * FEE_BPS) / 10000;
        uint256 totalRequired = margin + fee;

        require(usdc.balanceOf(msg.sender) >= totalRequired, "Insufficient balance");

        // Transfer funds to engine
        usdc.transferFrom(msg.sender, address(this), totalRequired);

        // Distribute fees
        uint256 insuranceFee = fee / 10;
        uint256 poolFee = fee - insuranceFee;

        usdc.transfer(address(insuranceFund), insuranceFee);
        
        usdc.approve(address(liquidityPool), poolFee);
        liquidityPool.collectTraderLoss(poolFee);

        // Fetch current price
        uint256 entryPrice = priceFeed.getPrice();
        require(entryPrice > 0, "Invalid price");

        positionsCount++;
        int256 currentFunding = fundingRateContract.getCumulativeFunding();

        positions[positionsCount] = Position({
            id: positionsCount,
            trader: msg.sender,
            isLong: isLong,
            sizeUSDC: sizeUSDC,
            leverage: leverage,
            margin: margin,
            entryPrice: entryPrice,
            entryFunding: currentFunding,
            isActive: true
        });

        userPositions[msg.sender].push(positionsCount);

        if (isLong) {
            longOI += sizeUSDC;
        } else {
            shortOI += sizeUSDC;
        }

        fundingRateContract.updateOI(longOI, shortOI);

        emit PositionOpened(positionsCount, msg.sender, isLong, sizeUSDC, leverage, entryPrice);
        return positionsCount;
    }

    function getPositionPnL(uint256 positionId)
        public
        view
        returns (
            int256 pnl,
            int256 fundingAccrued,
            uint256 currentPrice,
            bool isLiquidatable
        )
    {
        Position storage pos = positions[positionId];
        require(pos.isActive, "Position not active");

        currentPrice = priceFeed.getPrice();
        
        // Calculate price PnL
        int256 pricePnL;
        if (pos.isLong) {
            if (currentPrice >= pos.entryPrice) {
                pricePnL = int256((pos.sizeUSDC * (currentPrice - pos.entryPrice)) / pos.entryPrice);
            } else {
                pricePnL = -int256((pos.sizeUSDC * (pos.entryPrice - currentPrice)) / pos.entryPrice);
            }
        } else {
            if (pos.entryPrice >= currentPrice) {
                pricePnL = int256((pos.sizeUSDC * (pos.entryPrice - currentPrice)) / pos.entryPrice);
            } else {
                pricePnL = -int256((pos.sizeUSDC * (currentPrice - pos.entryPrice)) / pos.entryPrice);
            }
        }

        // Calculate funding accrued
        int256 currentFunding = fundingRateContract.getCumulativeFunding();
        int256 fundingDiff = currentFunding - pos.entryFunding;
        
        if (pos.isLong) {
            fundingAccrued = (int256(pos.sizeUSDC) * fundingDiff) / 1e18;
        } else {
            fundingAccrued = -(int256(pos.sizeUSDC) * fundingDiff) / 1e18;
        }

        // Net PnL = pricePnL - fundingAccrued
        pnl = pricePnL - fundingAccrued;

        // Liquidation check: if net loss exceeds margin minus maintenance margin
        int256 remainingMargin = int256(pos.margin) + pnl;
        uint256 maintenanceMargin = (pos.margin * MAINTENANCE_MARGIN_BPS) / 10000;
        
        isLiquidatable = remainingMargin <= int256(maintenanceMargin);
    }

    function closePosition(uint256 positionId) external {
        Position storage pos = positions[positionId];
        require(pos.isActive, "Position not active");
        require(pos.trader == msg.sender, "Not the trader");

        (int256 pnl, , uint256 currentPrice, ) = getPositionPnL(positionId);

        pos.isActive = false;

        if (pos.isLong) {
            longOI -= pos.sizeUSDC;
        } else {
            shortOI -= pos.sizeUSDC;
        }

        fundingRateContract.updateOI(longOI, shortOI);

        uint256 payout = 0;
        if (pnl >= 0) {
            // Profit
            uint256 profit = uint256(pnl);
            payout = pos.margin + profit;
            
            // Pay trader their initial margin from engine, and profit from pool
            usdc.transfer(pos.trader, pos.margin);
            liquidityPool.payTrader(pos.trader, profit);
        } else {
            // Loss
            uint256 loss = uint256(-pnl);
            if (loss < pos.margin) {
                payout = pos.margin - loss;
                // Pay remaining margin back to trader
                usdc.transfer(pos.trader, payout);
                // Collect loss into liquidity pool
                usdc.approve(address(liquidityPool), loss);
                liquidityPool.collectTraderLoss(loss);
            } else {
                // Total margin loss + bad debt
                uint256 badDebt = loss - pos.margin;
                
                // Collect whole margin into liquidity pool
                usdc.approve(address(liquidityPool), pos.margin);
                liquidityPool.collectTraderLoss(pos.margin);
                
                // Cover bad debt from insurance fund
                if (badDebt > 0) {
                    insuranceFund.coverBadDebt(pos.trader, badDebt);
                    usdc.approve(address(liquidityPool), usdc.balanceOf(address(this)) < badDebt ? usdc.balanceOf(address(this)) : badDebt);
                    liquidityPool.collectTraderLoss(usdc.balanceOf(address(this)) < badDebt ? usdc.balanceOf(address(this)) : badDebt);
                }
            }
        }

        emit PositionClosed(positionId, msg.sender, payout, pnl, currentPrice);
    }

    function liquidate(uint256 positionId) external {
        Position storage pos = positions[positionId];
        require(pos.isActive, "Position not active");

        (int256 pnl, , uint256 currentPrice, bool isLiquidatable) = getPositionPnL(positionId);
        require(isLiquidatable, "Position not liquidatable");

        pos.isActive = false;

        if (pos.isLong) {
            longOI -= pos.sizeUSDC;
        } else {
            shortOI -= pos.sizeUSDC;
        }

        fundingRateContract.updateOI(longOI, shortOI);

        int256 remainingMargin = int256(pos.margin) + pnl;
        uint256 payout = 0;

        if (remainingMargin > 0) {
            // Liquidator gets 50% of remaining margin
            uint256 bounty = uint256(remainingMargin) / 2;
            payout = bounty;
            
            // Transfer bounty to liquidator
            usdc.transfer(msg.sender, bounty);
            
            // Send rest of initial margin to pool
            uint256 poolShare = pos.margin - bounty;
            usdc.approve(address(liquidityPool), poolShare);
            liquidityPool.collectTraderLoss(poolShare);
        } else {
            // Bad debt case
            uint256 badDebt = uint256(-remainingMargin);
            
            // Whole margin goes to pool
            usdc.approve(address(liquidityPool), pos.margin);
            liquidityPool.collectTraderLoss(pos.margin);

            // Cover bad debt from insurance fund
            insuranceFund.coverBadDebt(pos.trader, badDebt);
            usdc.approve(address(liquidityPool), usdc.balanceOf(address(this)) < badDebt ? usdc.balanceOf(address(this)) : badDebt);
            liquidityPool.collectTraderLoss(usdc.balanceOf(address(this)) < badDebt ? usdc.balanceOf(address(this)) : badDebt);
        }

        emit PositionLiquidated(positionId, pos.trader, msg.sender, payout, pnl);
    }

    function addMargin(uint256 positionId, uint256 amount) external {
        Position storage pos = positions[positionId];
        require(pos.isActive, "Position not active");
        require(pos.trader == msg.sender, "Not the trader");
        require(amount > 0, "Amount must be > 0");

        require(usdc.balanceOf(msg.sender) >= amount, "Insufficient balance");

        usdc.transferFrom(msg.sender, address(this), amount);
        pos.margin += amount;

        emit MarginAdded(positionId, msg.sender, amount);
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return userPositions[user];
    }
}
