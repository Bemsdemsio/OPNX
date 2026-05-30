# OPN Perpetuals — Premium Perpetual Futures DEX on OPN Chain

OPN Perpetuals is a high-fidelity, decentralized perpetual futures exchange built exclusively for OPN Chain (EVM Testnet, Chain ID 984). Developed as a premier submission for OPN Builders Season 1 (DeFi & Open Finance), OPN Perpetuals brings deep liquidity and institutional-grade trading terminal UX onto OPN Chain. By utilizing fixed-point math, decentralized liquidity pooling, insurance backstops, and automated block-based funding, OPN Perpetuals provides traders with a robust trading engine supporting 2x to 10x leverage.

The protocol's architecture centers around the `PerpEngine`, which acts as the core controller orchestrating positions, computing real-time PnL, and executing liquidations. The system is fortified by `LiquidityPool` (acting as the liquidity vault and counterpart to all trades), `FundingRate` (restoring pricing equilibrium between longs and shorts every 100 blocks), and `InsuranceFund` (which accumulates 10% of fees to defend against bad debt). The frontend delivers a dark-themed visual experience, equipped with TradingView candlestick charts, flashing liquidation proximity indicators, open positions trackers, LP dashboards, and community leaderboard voting.

---

## 🎯 Smart Contract Deployments (OPN Testnet)

All smart contracts have been deployed and initialized on the **OPN Chain Testnet (Chain ID: 984)**:

| Contract | Deployed Address | Block Explorer Link |
|---|---|---|
| **Mock USDC Token** | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | [View Explorer](https://explorer.testnet.iopn.tech/address/0x5FbDB2315678afecb367f032d93F642f64180aa3) |
| **Mock Price Feed** | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` | [View Explorer](https://explorer.testnet.iopn.tech/address/0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512) |
| **Liquidity Pool** | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` | [View Explorer](https://explorer.testnet.iopn.tech/address/0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0) |
| **Insurance Fund** | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` | [View Explorer](https://explorer.testnet.iopn.tech/address/0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9) |
| **Funding Rate** | `0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9` | [View Explorer](https://explorer.testnet.iopn.tech/address/0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9) |
| **Perp Engine (Core)** | `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` | [View Explorer](https://explorer.testnet.iopn.tech/address/0x5FC8d32690cc91D4c39d9d3abcBD16989F875707) |

---

## 🚀 How to Run Locally

### 1. Compile & Test Smart Contracts
1. Navigate to the root directory `opn-perpetuals`.
2. Install Hardhat dependencies:
   ```bash
   npm install
   ```
3. Run the comprehensive unit test suite:
   ```bash
   npm run test
   ```

### 2. Start the Frontend
1. Navigate to the `frontend` subdirectory:
   ```bash
   cd frontend
   ```
2. Install frontend dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
3. Start the local Vite development server:
   ```bash
   npm run dev
   ```
4. Open the displayed local host (usually `http://localhost:5173`) in your browser with MetaMask connected!

---

## 📽 Demo Video & Walkthrough

[Watch the OPN Perpetuals Walkthrough & Demo Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ) *(Placeholder Link)*

### Ideal Demo Steps:
1. **Connect Wallet**: Connect MetaMask to OPN testnet.
2. **Deposit to Pool**: Under the `/pool` tab, deposit 1,000 USDC into the liquidity pool to gain oLP shares.
3. **Open LONG**: Toggle to the `/trade` tab, enter `500` USDC size, select `5x` leverage, and click **Open Long Position**.
4. **Spot Price Shifts**: Update the spot price in the price feed contract by 10% (from $2.00 to $2.20).
5. **View Profits**: Open `/positions` to observe a green +$250 PnL update live!
6. **Settlement**: Click **Close** on the position to settle profits on-chain.

---

## 🗺 Roadmap

*   **v2 — Real Oracle Integration**: Migrate away from manual mock price feeds to decentralized Chainlink-compatible pull oracles natively deployed on OPN Chain.
*   **v3 — Multi-Asset Margin**: Expand backing pool and position margin collateral options from USDC-only to OPN, WETH, and WBTC.
*   **v4 — Decentralized Governance**: Introduce the $OPNP governance token allowing oLP holders to vote on risk-factors, fee parameters, and liquidator fee structures.
