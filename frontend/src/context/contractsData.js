export const MockUSDC_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount) external",
  "function decimals() view returns (uint8)"
];

export const MockPriceFeed_ABI = [
  "function getPrice() view returns (uint256)",
  "function updatePrice(uint256 newPrice) external",
  "function lastUpdated() view returns (uint256)",
  "event PriceUpdated(uint256 newPrice, uint256 timestamp)"
];

export const LiquidityPool_ABI = [
  "function deposit(uint256 amount) external returns (uint256)",
  "function withdraw(uint256 shares) external returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "event Deposit(address indexed user, uint256 amount, uint256 shares)",
  "event Withdraw(address indexed user, uint256 amount, uint256 shares)"
];

export const FundingRate_ABI = [
  "function getCumulativeFunding() view returns (int256)",
  "function calculateFundingRate() view returns (int256)",
  "function longOI() view returns (uint256)",
  "function shortOI() view returns (uint256)",
  "function lastFundingBlock() view returns (uint256)",
  "function FUNDING_INTERVAL() view returns (uint256)",
  "event FundingUpdated(int256 fundingRate, int256 cumulativeFunding, uint256 blockNumber)"
];

export const InsuranceFund_ABI = [
  "function usdc() view returns (address)",
  "event BadDebtCovered(address indexed trader, uint256 amount)"
];

export const PerpEngine_ABI = [
  "function openPosition(bool isLong, uint256 sizeUSDC, uint256 leverage) external returns (uint256)",
  "function closePosition(uint256 positionId) external",
  "function liquidate(uint256 positionId) external",
  "function addMargin(uint256 positionId, uint256 amount) external",
  "function getPositionPnL(uint256 positionId) view returns (int256 pnl, int256 fundingAccrued, uint256 currentPrice, bool isLiquidatable)",
  "function positionsCount() view returns (uint256)",
  "function positions(uint256) view returns (uint256 id, address trader, bool isLong, uint256 sizeUSDC, uint256 leverage, uint256 margin, uint256 entryPrice, int256 entryFunding, bool isActive)",
  "function getUserPositions(address user) view returns (uint256[] memory)",
  "event PositionOpened(uint256 indexed positionId, address indexed trader, bool isLong, uint256 sizeUSDC, uint256 leverage, uint256 entryPrice)",
  "event PositionClosed(uint256 indexed positionId, address indexed trader, uint256 payout, int256 pnl, uint256 exitPrice)",
  "event PositionLiquidated(uint256 indexed positionId, address indexed trader, address indexed liquidator, uint256 payout, int256 pnl)",
  "event MarginAdded(uint256 indexed positionId, address indexed trader, uint256 amount)"
];
