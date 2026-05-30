const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy MockUSDC
  console.log("Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log("MockUSDC deployed to:", mockUSDCAddress);

  // 2. Deploy MockPriceFeed (initial price $2.00)
  console.log("Deploying MockPriceFeed...");
  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const mockPriceFeed = await MockPriceFeed.deploy(ethers.parseUnits("2.00", 18));
  await mockPriceFeed.waitForDeployment();
  const mockPriceFeedAddress = await mockPriceFeed.getAddress();
  console.log("MockPriceFeed deployed to:", mockPriceFeedAddress);

  // 3. Deploy LiquidityPool
  console.log("Deploying LiquidityPool...");
  const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
  const liquidityPool = await LiquidityPool.deploy(mockUSDCAddress);
  await liquidityPool.waitForDeployment();
  const liquidityPoolAddress = await liquidityPool.getAddress();
  console.log("LiquidityPool deployed to:", liquidityPoolAddress);

  // 4. Deploy InsuranceFund
  console.log("Deploying InsuranceFund...");
  const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
  const insuranceFund = await InsuranceFund.deploy(mockUSDCAddress);
  await insuranceFund.waitForDeployment();
  const insuranceFundAddress = await insuranceFund.getAddress();
  console.log("InsuranceFund deployed to:", insuranceFundAddress);

  // 5. Deploy FundingRate
  console.log("Deploying FundingRate...");
  const FundingRate = await ethers.getContractFactory("FundingRate");
  const fundingRate = await FundingRate.deploy();
  await fundingRate.waitForDeployment();
  const fundingRateAddress = await fundingRate.getAddress();
  console.log("FundingRate deployed to:", fundingRateAddress);

  // 6. Deploy PerpEngine
  console.log("Deploying PerpEngine...");
  const PerpEngine = await ethers.getContractFactory("PerpEngine");
  const perpEngine = await PerpEngine.deploy(
    mockUSDCAddress,
    mockPriceFeedAddress,
    liquidityPoolAddress,
    insuranceFundAddress,
    fundingRateAddress
  );
  await perpEngine.waitForDeployment();
  const perpEngineAddress = await perpEngine.getAddress();
  console.log("PerpEngine deployed to:", perpEngineAddress);

  // 7. Setup permissions
  console.log("Setting up contract permissions...");
  await liquidityPool.setPerpEngine(perpEngineAddress);
  await insuranceFund.setPerpEngine(perpEngineAddress);
  await fundingRate.setPerpEngine(perpEngineAddress);
  console.log("Permissions configured successfully!");

  // Save deployments
  const deployments = {
    network: "OPN Testnet",
    chainId: 984,
    MockUSDC: mockUSDCAddress,
    MockPriceFeed: mockPriceFeedAddress,
    LiquidityPool: liquidityPoolAddress,
    InsuranceFund: insuranceFundAddress,
    FundingRate: fundingRateAddress,
    PerpEngine: perpEngineAddress
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  fs.writeFileSync(
    path.join(deploymentsDir, "deployments.json"),
    JSON.stringify(deployments, null, 2)
  );
  console.log("Saved deployments to deployments/deployments.json");

  // Save to frontend too
  const frontendDeploymentsPath = path.join(__dirname, "../frontend/deployments.json");
  fs.writeFileSync(
    frontendDeploymentsPath,
    JSON.stringify(deployments, null, 2)
  );
  console.log("Saved deployments to frontend/deployments.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
