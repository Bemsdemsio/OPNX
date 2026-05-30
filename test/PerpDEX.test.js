const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("OPN Perpetuals Core Engine", function () {
  let mockUSDC, mockPriceFeed, liquidityPool, insuranceFund, fundingRate, perpEngine;
  let owner, user1, liquidator;
  
  const INITIAL_PRICE = ethers.parseUnits("2", 18); // $2.00 OPN/USDC
  const ONE_USDC = ethers.parseUnits("1", 18);

  beforeEach(async function () {
    [owner, user1, liquidator] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();

    // Deploy MockPriceFeed
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    mockPriceFeed = await MockPriceFeed.deploy(INITIAL_PRICE);
    await mockPriceFeed.waitForDeployment();

    // Deploy LiquidityPool
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    liquidityPool = await LiquidityPool.deploy(await mockUSDC.getAddress());
    await liquidityPool.waitForDeployment();

    // Deploy InsuranceFund
    const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
    insuranceFund = await InsuranceFund.deploy(await mockUSDC.getAddress());
    await insuranceFund.waitForDeployment();

    // Deploy FundingRate
    const FundingRate = await ethers.getContractFactory("FundingRate");
    fundingRate = await FundingRate.deploy();
    await fundingRate.waitForDeployment();

    // Deploy PerpEngine
    const PerpEngine = await ethers.getContractFactory("PerpEngine");
    perpEngine = await PerpEngine.deploy(
      await mockUSDC.getAddress(),
      await mockPriceFeed.getAddress(),
      await liquidityPool.getAddress(),
      await insuranceFund.getAddress(),
      await fundingRate.getAddress()
    );
    await perpEngine.waitForDeployment();

    // Set PerpEngine references
    await liquidityPool.setPerpEngine(await perpEngine.getAddress());
    await insuranceFund.setPerpEngine(await perpEngine.getAddress());
    await fundingRate.setPerpEngine(await perpEngine.getAddress());

    // Distribute USDC
    await mockUSDC.mint(user1.address, ethers.parseUnits("10000", 18));
    await mockUSDC.mint(liquidator.address, ethers.parseUnits("10000", 18));
  });

  describe("LiquidityPool", function () {
    it("Should deposit and withdraw USDC correctly", async function () {
      const depositAmount = ethers.parseUnits("1000", 18);
      await mockUSDC.connect(user1).approve(await liquidityPool.getAddress(), depositAmount);
      await liquidityPool.connect(user1).deposit(depositAmount);

      expect(await liquidityPool.totalAssets()).to.equal(depositAmount);
      expect(await liquidityPool.balanceOf(user1.address)).to.equal(depositAmount);

      // Withdraw shares
      await liquidityPool.connect(user1).withdraw(depositAmount);
      expect(await liquidityPool.totalAssets()).to.equal(0);
      expect(await mockUSDC.balanceOf(user1.address)).to.equal(ethers.parseUnits("10000", 18));
    });
  });

  describe("Trading Lifecycle (Long)", function () {
    it("Should open a long position, show profit, and close it", async function () {
      // 1. User deposits into pool to provide counterparty liquidity
      const lpDeposit = ethers.parseUnits("5000", 18);
      await mockUSDC.connect(owner).approve(await liquidityPool.getAddress(), lpDeposit);
      await liquidityPool.connect(owner).deposit(lpDeposit);

      // 2. Open Long position: 500 USDC size, 5x leverage ($100 margin)
      const size = ethers.parseUnits("500", 18);
      const leverage = 5n;
      const margin = size / leverage; // 100 USDC
      const fee = (size * 10n) / 10000n; // 0.5 USDC

      await mockUSDC.connect(user1).approve(await perpEngine.getAddress(), margin + fee);
      await perpEngine.connect(user1).openPosition(true, size, leverage);

      const pos = await perpEngine.positions(1);
      expect(pos.isActive).to.be.true;
      expect(pos.trader).to.equal(user1.address);
      expect(pos.sizeUSDC).to.equal(size);
      expect(pos.margin).to.equal(margin);

      // 3. Move price UP by 10%
      const newPrice = INITIAL_PRICE * 110n / 100n; // $2.20
      await mockPriceFeed.connect(owner).updatePrice(newPrice);

      const [pnl, , ,] = await perpEngine.getPositionPnL(1);
      // PnL = size * (2.2 - 2) / 2 = 500 * 0.1 = 50 USDC profit
      expect(pnl).to.equal(ethers.parseUnits("50", 18));

      // 4. Close position
      const balanceBefore = await mockUSDC.balanceOf(user1.address);
      await perpEngine.connect(user1).closePosition(1);

      const balanceAfter = await mockUSDC.balanceOf(user1.address);
      // Trader should receive margin ($100) + profit ($50) = $150
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseUnits("150", 18));
    });
  });

  describe("Trading Lifecycle (Short) & Liquidation", function () {
    it("Should liquidate short position when price goes up", async function () {
      // 1. User deposits into pool to provide counterparty liquidity
      const lpDeposit = ethers.parseUnits("5000", 18);
      await mockUSDC.connect(owner).approve(await liquidityPool.getAddress(), lpDeposit);
      await liquidityPool.connect(owner).deposit(lpDeposit);

      // 2. Open Short position: 500 USDC size, 5x leverage ($100 margin)
      const size = ethers.parseUnits("500", 18);
      const leverage = 5n;
      const margin = size / leverage; // 100 USDC
      const fee = (size * 10n) / 10000n; // 0.5 USDC

      await mockUSDC.connect(user1).approve(await perpEngine.getAddress(), margin + fee);
      await perpEngine.connect(user1).openPosition(false, size, leverage);

      // 3. Move price UP by 18% (which results in -18% * 5 = -90% PnL, triggering maintenance margin limit)
      const newPrice = INITIAL_PRICE * 118n / 100n; // $2.36
      await mockPriceFeed.connect(owner).updatePrice(newPrice);

      const [pnl, , , isLiquidatable] = await perpEngine.getPositionPnL(1);
      expect(isLiquidatable).to.be.true;

      // 4. Liquidator calls liquidation
      const liqBalanceBefore = await mockUSDC.balanceOf(liquidator.address);
      await perpEngine.connect(liquidator).liquidate(1);

      const pos = await perpEngine.positions(1);
      expect(pos.isActive).to.be.false;

      const liqBalanceAfter = await mockUSDC.balanceOf(liquidator.address);
      // Liquidator receives bounty = remaining margin / 2.
      // Margin = 100. PnL = -90. Remaining margin = 10. Bounty = 5.
      expect(liqBalanceAfter - liqBalanceBefore).to.equal(ethers.parseUnits("5", 18));
    });
  });
});
