import React, { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import {
  MockUSDC_ABI,
  MockPriceFeed_ABI,
  LiquidityPool_ABI,
  FundingRate_ABI,
  PerpEngine_ABI
} from './contractsData';
import deployments from '../../deployments.json' assert { type: 'json' };

const WalletContext = createContext();

export const OPN_TESTNET_PARAMS = {
  chainId: '0x3d8', // 984 in hex
  chainName: 'OPN Testnet',
  nativeCurrency: {
    name: 'OPN Token',
    symbol: 'OPN',
    decimals: 18,
  },
  rpcUrls: ['https://testnet-rpc.iopn.tech'],
  blockExplorerUrls: ['https://testnet-explorer.iopn.tech'], // placeholder explorer link
};

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [contracts, setContracts] = useState({});
  const [toasts, setToasts] = useState([]);

  // Persistent Global Volume State
  const [globalVolume, setGlobalVolume] = useState(() => {
    return 100.00;
  });

  const [globalVolumeHistory, setGlobalVolumeHistory] = useState(() => {
    return [
      { time: Math.floor(Date.now() / 1000) - 86400, value: 100.00 },
      { time: Math.floor(Date.now() / 1000), value: 100.00 }
    ];
  });

  // Load account-specific volume data on mount or change
  useEffect(() => {
    if (account) {
      const savedVolume = localStorage.getItem(`opnx_global_volume_${account}`);
      if (savedVolume) {
        setGlobalVolume(parseFloat(savedVolume));
      } else {
        setGlobalVolume(100.00);
      }

      const savedHistory = localStorage.getItem(`opnx_global_volume_history_${account}`);
      if (savedHistory) {
        try {
          setGlobalVolumeHistory(JSON.parse(savedHistory));
        } catch (e) {
          console.error(e);
        }
      } else {
        setGlobalVolumeHistory([
          { time: Math.floor(Date.now() / 1000) - 86400, value: 100.00 },
          { time: Math.floor(Date.now() / 1000), value: 100.00 }
        ]);
      }
    }
  }, [account]);

  // Sync to localStorage
  const updateGlobalVolume = (newVol) => {
    setGlobalVolume(newVol);
    if (account) {
      localStorage.setItem(`opnx_global_volume_${account}`, newVol.toString());
    }
  };

  const updateGlobalVolumeHistory = (newHistory) => {
    setGlobalVolumeHistory(newHistory);
    if (account) {
      localStorage.setItem(`opnx_global_volume_history_${account}`, JSON.stringify(newHistory));
    }
  };

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const checkNetwork = async (ethProvider) => {
    const network = await ethProvider.getNetwork();
    const currentChainId = Number(network.chainId);
    setChainId(currentChainId);

    if (currentChainId !== 984) {
      addToast("Please switch your network to OPN Testnet!", "warning");
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: OPN_TESTNET_PARAMS.chainId }],
        });
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [OPN_TESTNET_PARAMS],
            });
          } catch (addError) {
            console.error("Failed to add network:", addError);
            addToast("Failed to add OPN Testnet to your wallet.", "error");
          }
        } else {
          console.error("Failed to switch network:", switchError);
        }
      }
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      addToast("MetaMask is not installed. Please install it to use this app!", "error");
      return;
    }

    setLoading(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const activeSigner = await browserProvider.getSigner();

      setAccount(accounts[0]);
      setProvider(browserProvider);
      setSigner(activeSigner);

      await checkNetwork(browserProvider);
      initializeContracts(browserProvider, activeSigner);
      addToast("Wallet connected successfully!", "success");
    } catch (error) {
      console.error("Wallet connection failed:", error);
      addToast("Failed to connect wallet.", "error");
    } finally {
      setLoading(false);
    }
  };

  const initializeContracts = (ethProvider, activeSigner) => {
    try {
      const runner = activeSigner || ethProvider;

      const usdc = new ethers.Contract(deployments.MockUSDC, MockUSDC_ABI, runner);
      const priceFeed = new ethers.Contract(deployments.MockPriceFeed, MockPriceFeed_ABI, runner);
      const liquidityPool = new ethers.Contract(deployments.LiquidityPool, LiquidityPool_ABI, runner);
      const fundingRate = new ethers.Contract(deployments.FundingRate, FundingRate_ABI, runner);
      const perpEngine = new ethers.Contract(deployments.PerpEngine, PerpEngine_ABI, runner);

      setContracts({
        usdc,
        priceFeed,
        liquidityPool,
        fundingRate,
        perpEngine
      });

      // Setup Event Listeners for real-time alerts
      perpEngine.on("PositionOpened", (positionId, trader, isLong, sizeUSDC, leverage, entryPrice) => {
        if (trader.toLowerCase() === account?.toLowerCase()) {
          addToast(`Position #${positionId} opened! size: $${ethers.formatUnits(sizeUSDC, 18)} USDC, ${leverage}x ✓`, "success");
        }
      });

      perpEngine.on("PositionClosed", (positionId, trader, payout, pnl, exitPrice) => {
        if (trader.toLowerCase() === account?.toLowerCase()) {
          const formattedPnl = ethers.formatUnits(pnl, 18);
          const pnlValue = parseFloat(formattedPnl);
          const sign = pnlValue >= 0 ? '+' : '';
          addToast(`Position #${positionId} closed! PnL: ${sign}$${pnlValue.toFixed(2)} ✓`, pnlValue >= 0 ? "success" : "warning");
        }
      });

      perpEngine.on("PositionLiquidated", (positionId, trader, liquidator, payout, pnl) => {
        if (trader.toLowerCase() === account?.toLowerCase()) {
          addToast(`⚠ Position #${positionId} was LIQUIDATED! ⚠`, "error");
        } else {
          addToast(`Position #${positionId} liquidated by ${liquidator.substring(0, 6)}...`, "info");
        }
      });

      fundingRate.on("FundingUpdated", (rate, cumulative, blockNumber) => {
        addToast(`Funding rate updated: ${parseFloat(ethers.formatUnits(rate, 14)).toFixed(4)}% 💸`, "info");
      });

    } catch (e) {
      console.error("Failed to initialize contracts:", e);
    }
  };

  // Re-run connection and check accounts on load
  useEffect(() => {
    if (window.ethereum) {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          browserProvider.getSigner().then((activeSigner) => {
            setSigner(activeSigner);
            initializeContracts(browserProvider, activeSigner);
          });
          addToast("Account changed!", "info");
        } else {
          setAccount(null);
          setSigner(null);
          setContracts({});
          addToast("Wallet disconnected.", "warning");
        }
      });

      window.ethereum.on('chainChanged', (chainIdHex) => {
        window.location.reload();
      });
    }
  }, [account]);

  return (
    <WalletContext.Provider value={{
      account,
      provider,
      signer,
      chainId,
      loading,
      contracts,
      connectWallet,
      toasts,
      addToast,
      removeToast,
      globalVolume,
      setGlobalVolume: updateGlobalVolume,
      globalVolumeHistory,
      setGlobalVolumeHistory: updateGlobalVolumeHistory
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
