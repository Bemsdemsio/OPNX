// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract FundingRate is Ownable {
    address public perpEngine;
    
    uint256 public longOI; // Open Interest Longs
    uint256 public shortOI; // Open Interest Shorts
    
    int256 public cumulativeFunding; // 1e18 precision
    uint256 public lastFundingBlock;
    uint256 public constant FUNDING_INTERVAL = 100;
    int256 public constant RATE_FACTOR = 1e14; // funding rate multiplier

    event FundingUpdated(int256 fundingRate, int256 cumulativeFunding, uint256 blockNumber);
    event PerpEngineSet(address indexed engine);

    modifier onlyPerpEngine() {
        require(msg.sender == perpEngine, "Only PerpEngine");
        _;
    }

    constructor() Ownable(msg.sender) {
        lastFundingBlock = block.number;
    }

    function setPerpEngine(address _perpEngine) external onlyOwner {
        perpEngine = _perpEngine;
        emit PerpEngineSet(_perpEngine);
    }

    function updateOI(uint256 _longOI, uint256 _shortOI) external onlyPerpEngine {
        longOI = _longOI;
        shortOI = _shortOI;
        
        // If 100 blocks have passed, apply funding rate step
        if (block.number >= lastFundingBlock + FUNDING_INTERVAL) {
            int256 fundingRate = calculateFundingRate();
            cumulativeFunding += fundingRate;
            lastFundingBlock = block.number;
            emit FundingUpdated(fundingRate, cumulativeFunding, block.number);
        }
    }

    function calculateFundingRate() public view returns (int256) {
        if (longOI + shortOI == 0) return 0;
        
        // simple premium model: (Long - Short) / (Long + Short) * Factor
        int256 diff = int256(longOI) - int256(shortOI);
        int256 sum = int256(longOI + shortOI);
        
        return (diff * RATE_FACTOR) / sum;
    }

    function getCumulativeFunding() external view returns (int256) {
        return cumulativeFunding;
    }
}
