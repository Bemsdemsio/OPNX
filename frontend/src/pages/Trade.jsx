import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import { ethers } from 'ethers';
import { createChart } from 'lightweight-charts';
import { TrendingUp, TrendingDown, ShieldAlert, Award, Database, Wallet } from 'lucide-react';

export default function Trade() {
  const { account, contracts, addToast, connectWallet } = useWallet();
  const [isLong, setIsLong] = useState(true);
  const [size, setSize] = useState('100');
  const [leverage, setLeverage] = useState(5);
  const [currentPrice, setCurrentPrice] = useState(2.00);
  const [balance, setBalance] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [minting, setMinting] = useState(false);
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('2.00');
  
  // Bottom Tab terminal states
  const [positions, setPositions] = useState([]);
  const [bottomTab, setBottomTab] = useState('positions');
  const [selectedPos, setSelectedPos] = useState(null);
  const [marginAmount, setMarginAmount] = useState('50');
  const [submittingMargin, setSubmittingMargin] = useState(false);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [tpslEnabled, setTpslEnabled] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState('2.2000');
  const [stopLossPrice, setStopLossPrice] = useState('1.9000');
  const [selectedPosForTPSL, setSelectedPosForTPSL] = useState(null);
  const [editTPPrice, setEditTPPrice] = useState('');
  const [editSLPrice, setEditSLPrice] = useState('');

  const fetchTradeHistory = async () => {
    if (!contracts.perpEngine || !account) return;
    setLoadingHistory(true);
    try {
      // Start with localStorage items to be instant
      const localItems = JSON.parse(localStorage.getItem(`trade_history_${account}`) || '[]');
      let blockchainItems = [];

      try {
        const currentBlock = await provider.getBlockNumber();
        // Query last 3000 blocks to prevent range timeout/errors on public RPCs
        const startBlock = Math.max(0, currentBlock - 3000);

        const filterClosed = contracts.perpEngine.filters.PositionClosed(null, account);
        const eventsClosed = await contracts.perpEngine.queryFilter(filterClosed, startBlock, 'latest');

        const filterLiquidated = contracts.perpEngine.filters.PositionLiquidated(null, account);
        const eventsLiquidated = await contracts.perpEngine.queryFilter(filterLiquidated, startBlock, 'latest');

        // Process closed positions
        for (const event of eventsClosed) {
          const positionId = event.args[0];
          const payout = parseFloat(ethers.formatUnits(event.args[2], 18));
          const pnl = parseFloat(ethers.formatUnits(event.args[3], 18));
          const exitPrice = parseFloat(ethers.formatUnits(event.args[4], 18));

          const rawPos = await contracts.perpEngine.positions(positionId);

          let timestamp = Date.now();
          try {
            const block = await event.getBlock();
            timestamp = block.timestamp * 1000;
          } catch (err) {
            console.error("Error fetching block:", err);
          }

          blockchainItems.push({
            id: Number(positionId),
            isLong: rawPos.isLong,
            size: parseFloat(ethers.formatUnits(rawPos.sizeUSDC, 18)),
            leverage: Number(rawPos.leverage),
            entryPrice: parseFloat(ethers.formatUnits(rawPos.entryPrice, 18)),
            exitPrice: exitPrice,
            payout: payout,
            pnl: pnl,
            type: 'Close',
            timestamp
          });
        }

        // Process liquidated positions
        for (const event of eventsLiquidated) {
          const positionId = event.args[0];
          const payout = parseFloat(ethers.formatUnits(event.args[3], 18));
          const pnl = parseFloat(ethers.formatUnits(event.args[4], 18));

          const rawPos = await contracts.perpEngine.positions(positionId);

          let timestamp = Date.now();
          try {
            const block = await event.getBlock();
            timestamp = block.timestamp * 1000;
          } catch (err) {
            console.error("Error fetching block:", err);
          }

          blockchainItems.push({
            id: Number(positionId),
            isLong: rawPos.isLong,
            size: parseFloat(ethers.formatUnits(rawPos.sizeUSDC, 18)),
            leverage: Number(rawPos.leverage),
            entryPrice: parseFloat(ethers.formatUnits(rawPos.entryPrice, 18)),
            exitPrice: pnl < 0 ? parseFloat(ethers.formatUnits(rawPos.entryPrice, 18)) * (1 - 0.9 / Number(rawPos.leverage)) : parseFloat(ethers.formatUnits(rawPos.entryPrice, 18)),
            payout: payout,
            pnl: pnl,
            type: 'Liquidated',
            timestamp
          });
        }
      } catch (err) {
        console.warn("Failed to fetch from blockchain events, falling back to localStorage:", err);
      }

      // Combine and remove duplicates by positionId & type
      const combined = [...localItems];
      for (const item of blockchainItems) {
        if (!combined.some(c => c.id === item.id && c.type === item.type)) {
          combined.push(item);
        }
      }

      combined.sort((a, b) => b.timestamp - a.timestamp);
      
      // Save back to localStorage to keep it sync'd
      localStorage.setItem(`trade_history_${account}`, JSON.stringify(combined));
      setTradeHistory(combined);
    } catch (e) {
      console.error("Error fetching trade history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };
  
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);

  // Calculations
  const sizeFloat = parseFloat(size) || 0;
  const marginNeeded = sizeFloat / leverage;
  const entryPrice = currentPrice;
  
  // Liquidation Price calculation:
  // Long Liquidation: entryPrice * (1 - 0.9 / leverage) -- since remaining margin limit is 10% (loss <= 90% of margin)
  // Short Liquidation: entryPrice * (1 + 0.9 / leverage)
  const liquidationPrice = isLong 
    ? entryPrice * (1 - 0.9 / leverage) 
    : entryPrice * (1 + 0.9 / leverage);

  const fee = sizeFloat * 0.001; // 0.1%

  // Check if current price is within 20% of liquidation price
  const percentDiff = Math.abs(currentPrice - liquidationPrice) / currentPrice;
  const isCloseToLiquidation = percentDiff <= 0.20;

  // Fetch current price & balance
  const fetchData = async () => {
    if (!contracts.priceFeed || !contracts.usdc || !account) return;
    try {
      const priceRaw = await contracts.priceFeed.getPrice();
      const priceNum = parseFloat(ethers.formatUnits(priceRaw, 18));
      setCurrentPrice(priceNum);

      const balRaw = await contracts.usdc.balanceOf(account);
      setBalance(parseFloat(ethers.formatUnits(balRaw, 18)).toFixed(2));
    } catch (e) {
      console.error("Error fetching trade data:", e);
    }
  };

  const fetchPositions = async () => {
    if (!contracts.perpEngine || !account) return;
    try {
      const positionIds = await contracts.perpEngine.getUserPositions(account);
      const activePositions = [];
      const tpslData = JSON.parse(localStorage.getItem(`tpsl_targets_${account}`) || '{}');

      for (let i = 0; i < positionIds.length; i++) {
        const posId = positionIds[i];
        const rawPos = await contracts.perpEngine.positions(posId);
        
        if (rawPos.isActive) {
          const [pnlRaw, fundingRaw, currentPriceRaw, isLiquidatable] = 
            await contracts.perpEngine.getPositionPnL(posId);

          const curPrice = parseFloat(ethers.formatUnits(currentPriceRaw, 18));
          const pId = Number(posId);

          // Check if TP/SL was hit!
          const target = tpslData[pId];
          if (target) {
            let hit = false;
            let triggerType = "";
            if (target.isLong) {
              if (target.takeProfit > 0 && curPrice >= target.takeProfit) {
                hit = true;
                triggerType = "Take Profit";
              } else if (target.stopLoss > 0 && curPrice <= target.stopLoss) {
                hit = true;
                triggerType = "Stop Loss";
              }
            } else {
              // Short position
              if (target.takeProfit > 0 && curPrice <= target.takeProfit) {
                hit = true;
                triggerType = "Take Profit";
              } else if (target.stopLoss > 0 && curPrice >= target.stopLoss) {
                hit = true;
                triggerType = "Stop Loss";
              }
            }

            if (hit) {
              addToast(`⚡ [${triggerType} Triggered] Auto-closing Position #${pId} at $${curPrice.toFixed(4)}...`, "info");
              delete tpslData[pId];
              localStorage.setItem(`tpsl_targets_${account}`, JSON.stringify(tpslData));
              handleClosePosition(pId);
              continue;
            }
          }

          activePositions.push({
            id: pId,
            isLong: rawPos.isLong,
            size: parseFloat(ethers.formatUnits(rawPos.sizeUSDC, 18)),
            leverage: Number(rawPos.leverage),
            margin: parseFloat(ethers.formatUnits(rawPos.margin, 18)),
            entryPrice: parseFloat(ethers.formatUnits(rawPos.entryPrice, 18)),
            currentPrice: curPrice,
            pnl: parseFloat(ethers.formatUnits(pnlRaw, 18)),
            funding: parseFloat(ethers.formatUnits(fundingRaw, 18)),
            isLiquidatable
          });
        }
      }
      setPositions(activePositions);
    } catch (e) {
      console.error("Error fetching positions:", e);
    }
  };

  const handleClosePosition = async (id) => {
    if (!contracts.perpEngine) return;
    try {
      addToast(`Closing position #${id}...`, "info");
      const posDetails = positions.find(p => p.id === id);
      
      const tx = await contracts.perpEngine.closePosition(id);
      await tx.wait();
      
      if (posDetails) {
        const tradeItem = {
          id: id,
          isLong: posDetails.isLong,
          size: posDetails.size,
          leverage: posDetails.leverage,
          entryPrice: posDetails.entryPrice,
          exitPrice: currentPrice,
          payout: Math.max(0, posDetails.margin + posDetails.pnl),
          pnl: posDetails.pnl,
          type: 'Close',
          timestamp: Date.now()
        };
        const localHist = JSON.parse(localStorage.getItem(`trade_history_${account}`) || '[]');
        localHist.unshift(tradeItem);
        localStorage.setItem(`trade_history_${account}`, JSON.stringify(localHist));
      }

      fetchPositions();
      fetchData();
      fetchTradeHistory();
    } catch (e) {
      console.error(e);
      addToast("Close transaction failed.", "error");
    }
  };

  const handleAddMargin = async () => {
    if (!contracts.perpEngine || !contracts.usdc || !selectedPos) return;
    setSubmittingMargin(true);
    try {
      const amountUnits = ethers.parseUnits(marginAmount, 18);
      const allowance = await contracts.usdc.allowance(account, await contracts.perpEngine.getAddress());
      if (allowance < amountUnits) {
        addToast("Approving USDC...", "info");
        const appTx = await contracts.usdc.approve(await contracts.perpEngine.getAddress(), ethers.MaxUint256);
        await appTx.wait();
      }

      addToast(`Adding $${marginAmount} USDC margin to position #${selectedPos.id}...`, "info");
      const tx = await contracts.perpEngine.addMargin(selectedPos.id, amountUnits);
      await tx.wait();
      
      setSelectedPos(null);
      fetchPositions();
      fetchData();
    } catch (e) {
      console.error(e);
      addToast("Failed to add margin.", "error");
    } finally {
      setSubmittingMargin(false);
    }
  };

  const handleLiquidateDemo = async (id) => {
    if (!contracts.perpEngine) return;
    try {
      addToast("Checking liquidation...", "info");
      const tx = await contracts.perpEngine.liquidate(id);
      await tx.wait();
      addToast("✓ Liquidated position!", "success");
      fetchPositions();
      fetchData();
      fetchTradeHistory();
    } catch (e) {
      console.error(e);
      addToast("Cannot liquidate. Position is safe.", "warning");
    }
  };

  useEffect(() => {
    fetchData();
    fetchPositions();
    fetchTradeHistory();
    const interval = setInterval(() => {
      fetchData();
      fetchPositions();
      fetchTradeHistory();
    }, 5000);
    return () => clearInterval(interval);
  }, [contracts, account]);

  // Chart initialization
  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartRef.current = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#1a1a1a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#2a2a2a' },
        horzLines: { color: '#2a2a2a' },
      },
      crosshair: {
        mode: 0,
      },
      priceScale: {
        borderColor: '#3e3e3e',
      },
      timeScale: {
        borderColor: '#3e3e3e',
        timeVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 380,
    });

    candleSeriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff4444',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff4444',
      wickUpColor: '#00ff88',
      wickDownColor: '#ff4444',
    });

    // Mock initial chart history starting around $2
    let baseTime = Math.floor(Date.now() / 1000) - 3600 * 24;
    const initialData = [];
    let price = 2.00;
    
    for (let i = 0; i < 99; i++) {
      const open = price;
      // Mean-reverting drift pulling the random walk back to $2.00
      const drift = (2.00 - price) * 0.08;
      const randomChange = (Math.random() - 0.5) * 0.05;
      const close = price + drift + randomChange;
      const high = Math.max(open, close) + Math.random() * 0.02;
      const low = Math.min(open, close) - Math.random() * 0.02;
      
      initialData.push({
        time: baseTime + i * 300,
        open,
        high,
        low,
        close
      });
      price = close;
    }

    // Set 100th candle to end exactly at 2.00 to align with mark price baseline
    initialData.push({
      time: baseTime + 99 * 300,
      open: price,
      high: Math.max(price, 2.00) + 0.01,
      low: Math.min(price, 2.00) - 0.01,
      close: 2.00
    });

    candleSeriesRef.current.setData(initialData);

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, []);

  // Update chart candlestick with current price ticks
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    const now = Math.floor(Date.now() / 1000);
    candleSeriesRef.current.update({
      time: now - (now % 300), // round to nearest 5m
      open: currentPrice * 0.998,
      high: currentPrice * 1.002,
      low: currentPrice * 0.997,
      close: currentPrice,
    });
  }, [currentPrice]);

  useEffect(() => {
    if (isLong) {
      setTakeProfitPrice((currentPrice * 1.10).toFixed(4));
      setStopLossPrice((currentPrice * 0.95).toFixed(4));
    } else {
      setTakeProfitPrice((currentPrice * 0.90).toFixed(4));
      setStopLossPrice((currentPrice * 1.05).toFixed(4));
    }
  }, [isLong, tpslEnabled]);

  const handleMintUSDC = async () => {
    if (!contracts.usdc || !account) return;
    setMinting(true);
    try {
      const tx = await contracts.usdc.mint(account, ethers.parseUnits("2000", 18));
      addToast("Minting test USDC...", "info");
      await tx.wait();
      addToast("✓ 2,000 mUSDC minted to your wallet!", "success");
      fetchData();
    } catch (e) {
      console.error(e);
      addToast("Minting failed.", "error");
    } finally {
      setMinting(false);
    }
  };

  const handleOpenPosition = async () => {
    if (!account) {
      connectWallet();
      return;
    }
    if (!contracts.perpEngine || !contracts.usdc) return;
    if (sizeFloat <= 0) {
      addToast("Please enter a valid size", "warning");
      return;
    }

    setSubmitting(true);
    try {
      const sizeUnits = ethers.parseUnits(size, 18);
      const totalRequired = ethers.parseUnits((marginNeeded + fee).toString(), 18);

      // Check allowance
      const allowance = await contracts.usdc.allowance(account, await contracts.perpEngine.getAddress());
      if (allowance < totalRequired) {
        addToast("Approving USDC transfers...", "info");
        const appTx = await contracts.usdc.approve(await contracts.perpEngine.getAddress(), ethers.MaxUint256);
        await appTx.wait();
        addToast("USDC Approved ✓", "success");
      }

      addToast("Opening position...", "info");
      const tx = await contracts.perpEngine.openPosition(isLong, sizeUnits, BigInt(leverage));
      const receipt = await tx.wait();

      let newPositionId = null;
      if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsedLog = contracts.perpEngine.interface.parseLog(log);
            if (parsedLog && parsedLog.name === "PositionOpened") {
              newPositionId = Number(parsedLog.args[0]);
              break;
            }
          } catch (err) {}
        }
      }

      if (newPositionId && tpslEnabled) {
        const tpslData = JSON.parse(localStorage.getItem(`tpsl_targets_${account}`) || '{}');
        tpslData[newPositionId] = {
          takeProfit: parseFloat(takeProfitPrice),
          stopLoss: parseFloat(stopLossPrice),
          isLong: isLong
        };
        localStorage.setItem(`tpsl_targets_${account}`, JSON.stringify(tpslData));
        addToast(`TP/SL configured for Position #${newPositionId}! ✓`, "success");
      }

      // INSTANT VOLUME RECORDING: Write to localStorage volume cache immediately
      try {
        const storageKey = `opnx_volume_events_${account}`;
        const cachedVolEvents = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const key = `${receipt.blockNumber || 0}_${receipt.hash || tx.hash}_${Date.now()}`;
        
        cachedVolEvents.push({
          key,
          blockNumber: receipt.blockNumber || 0,
          transactionHash: receipt.hash || tx.hash,
          logIndex: Date.now(),
          size: parseFloat(size),
          timestamp: Math.floor(Date.now() / 1000)
        });
        
        localStorage.setItem(storageKey, JSON.stringify(cachedVolEvents));
        console.log("Cached new volume event successfully:", size);
      } catch (volErr) {
        console.error("Failed to instantly cache trade volume:", volErr);
      }

      fetchData();
    } catch (e) {
      console.error(e);
      addToast("Execution failed or rejected.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 p-4">
      {/* Chart Panel */}
      <div className="lg:col-span-3 bg-cardBg rounded-xl p-4 border border-[#2a2a2a] shadow-xl flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold tracking-wide">OPN / USDC</span>
              <span className="text-sm font-semibold px-2 py-0.5 rounded bg-emerald-950 text-tradeGreen border border-emerald-800">
                100% On-Chain
              </span>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-gray-400">Mark Price</p>
                <p className="text-lg font-bold text-tradeGreen">${currentPrice.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">24h High</p>
                <p className="text-sm font-semibold">${(currentPrice * 1.05).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">24h Low</p>
                <p className="text-sm font-semibold">${(currentPrice * 0.95).toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden border border-[#2a2a2a] bg-[#1a1a1a]" />
        </div>

        {/* Faucet container */}
        <div className="mt-4 pt-4 border-t border-[#2a2a2a] flex justify-between items-center mb-6">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Wallet className="w-4 h-4 text-tradeGreen" />
            <span>USDC Balance: <b>${balance}</b></span>
          </div>
          {account && (
            <button
              onClick={handleMintUSDC}
              disabled={minting}
              className="px-4 py-1.5 rounded-lg bg-[#2a2a2a] hover:bg-[#383838] border border-[#3e3e3e] font-semibold text-xs transition duration-200"
            >
              {minting ? 'Minting...' : 'Faucet (+2000 USDC)'}
            </button>
          )}
        </div>

        {/* Integrated Bottom Tabs Terminal (Positions, Balances, Orders, History) */}
        <div className="border border-[#2a2a2a] rounded-lg overflow-hidden bg-[#151515]">
          <div className="flex border-b border-[#2a2a2a] bg-[#1a1a1a]/80 text-xs font-bold text-gray-400">
            <button
              onClick={() => setBottomTab('positions')}
              className={`px-4 py-2.5 transition duration-150 ${
                bottomTab === 'positions' ? 'text-tradeGreen border-b-2 border-tradeGreen bg-[#151515]' : 'hover:text-white'
              }`}
            >
              Positions ({positions.length})
            </button>
            <button
              onClick={() => setBottomTab('balances')}
              className={`px-4 py-2.5 transition duration-150 ${
                bottomTab === 'balances' ? 'text-tradeGreen border-b-2 border-tradeGreen bg-[#151515]' : 'hover:text-white'
              }`}
            >
              Balances
            </button>
            <button
              onClick={() => setBottomTab('orders')}
              className={`px-4 py-2.5 transition duration-150 ${
                bottomTab === 'orders' ? 'text-tradeGreen border-b-2 border-tradeGreen bg-[#151515]' : 'hover:text-white'
              }`}
            >
              Open Orders (0)
            </button>
            <button
              onClick={() => setBottomTab('history')}
              className={`px-4 py-2.5 transition duration-150 ${
                bottomTab === 'history' ? 'text-tradeGreen border-b-2 border-tradeGreen bg-[#151515]' : 'hover:text-white'
              }`}
            >
              Trade History
            </button>
          </div>

          <div className="p-4 bg-[#0f0f0f]/60 min-h-[140px] text-xs">
            {bottomTab === 'positions' && (
              <>
                {positions.length === 0 ? (
                  <p className="text-center text-gray-500 py-6">Your open perp positions will appear here.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-gray-500 uppercase border-b border-[#252525]">
                          <th className="pb-2">Market</th>
                          <th className="pb-2">Size</th>
                          <th className="pb-2">Margin</th>
                          <th className="pb-2">Entry Price</th>
                          <th className="pb-2">Mark Price</th>
                          <th className="pb-2">TP / SL</th>
                          <th className="pb-2">PnL</th>
                          <th className="pb-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="font-semibold divide-y divide-[#202020]">
                        {positions.map((pos) => {
                          const tpslLocal = JSON.parse(localStorage.getItem(`tpsl_targets_${account}`) || '{}');
                          const target = tpslLocal[pos.id];
                          return (
                            <tr key={pos.id} className="hover:bg-[#202020]/20 transition">
                              <td className="py-2.5 flex items-center gap-1.5">
                                <span className={pos.isLong ? "text-tradeGreen font-extrabold" : "text-tradeRed font-extrabold"}>
                                  {pos.isLong ? 'LONG' : 'SHORT'}
                                </span>
                                <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">{pos.leverage}x</span>
                              </td>
                              <td className="py-2.5 text-white">${pos.size.toFixed(2)}</td>
                              <td className="py-2.5 text-white">${pos.margin.toFixed(2)}</td>
                              <td className="py-2.5 text-zinc-400">${pos.entryPrice.toFixed(4)}</td>
                              <td className="py-2.5 text-zinc-400">${pos.currentPrice.toFixed(4)}</td>
                              <td className="py-2.5">
                                {target ? (
                                  <div className="flex flex-col text-[10px] font-extrabold gap-0.5 leading-none">
                                    <span className="text-tradeGreen">TP: ${parseFloat(target.takeProfit).toFixed(3)}</span>
                                    <span className="text-tradeRed">SL: ${parseFloat(target.stopLoss).toFixed(3)}</span>
                                  </div>
                                ) : (
                                  <span className="text-zinc-600 font-bold">—</span>
                                )}
                              </td>
                              <td className={`py-2.5 ${pos.pnl >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`}>
                                {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)} ({((pos.pnl / pos.margin) * 100).toFixed(1)}%)
                              </td>
                              <td className="py-2.5 text-right">
                                <div className="flex gap-1.5 justify-end">
                                  <button
                                    onClick={() => setSelectedPos(pos)}
                                    className="px-2 py-1 rounded bg-[#202020] border border-[#3e3e3e] hover:bg-[#303030] text-[10px] font-bold text-white transition"
                                  >
                                    Margin
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedPosForTPSL(pos);
                                      setEditTPPrice(target ? target.takeProfit.toString() : pos.isLong ? (pos.currentPrice * 1.10).toFixed(4) : (pos.currentPrice * 0.90).toFixed(4));
                                      setEditSLPrice(target ? target.stopLoss.toString() : pos.isLong ? (pos.currentPrice * 0.95).toFixed(4) : (pos.currentPrice * 1.05).toFixed(4));
                                    }}
                                    className="px-2 py-1 rounded bg-[#202020] border border-[#3e3e3e] hover:bg-[#303030] text-[10px] font-bold text-white transition"
                                  >
                                    TP/SL
                                  </button>
                                  {pos.isLiquidatable ? (
                                    <button
                                      onClick={() => handleLiquidateDemo(pos.id)}
                                      className="px-2 py-1 rounded bg-tradeRed hover:bg-rose-600 text-white text-[10px] font-bold transition"
                                    >
                                      ☠ Liquidate
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleClosePosition(pos.id)}
                                      className="px-2 py-1 rounded bg-[#311]/40 border border-[#f44]/30 hover:bg-[#f44]/15 text-tradeRed text-[10px] font-bold transition"
                                    >
                                      Close
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {bottomTab === 'balances' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-gray-500 uppercase border-b border-[#252525]">
                      <th className="pb-2">Asset</th>
                      <th className="pb-2">Balance</th>
                      <th className="pb-2">Value USD</th>
                      <th className="pb-2">Deposit APY</th>
                      <th className="pb-2">Borrow APY</th>
                    </tr>
                  </thead>
                  <tbody className="font-semibold divide-y divide-[#202020]">
                    <tr>
                      <td className="py-2.5 text-white">mUSDC</td>
                      <td className="py-2.5 text-white">{parseFloat(balance).toFixed(2)} USDC</td>
                      <td className="py-2.5 text-white">${parseFloat(balance).toFixed(2)}</td>
                      <td className="py-2.5 text-tradeGreen">2.82%</td>
                      <td className="py-2.5 text-gray-500">3.85%</td>
                    </tr>
                    <tr className="opacity-60">
                      <td className="py-2.5 text-white">mBTC</td>
                      <td className="py-2.5 text-zinc-500">0.0000 mBTC</td>
                      <td className="py-2.5 text-zinc-500">$0.00</td>
                      <td className="py-2.5 text-tradeGreen">0.24%</td>
                      <td className="py-2.5 text-gray-500">1.82%</td>
                    </tr>
                    <tr className="opacity-60">
                      <td className="py-2.5 text-white">mETH</td>
                      <td className="py-2.5 text-zinc-500">0.0000 mETH</td>
                      <td className="py-2.5 text-zinc-500">$0.00</td>
                      <td className="py-2.5 text-tradeGreen">1.25%</td>
                      <td className="py-2.5 text-gray-500">3.40%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {bottomTab === 'orders' && (
              <p className="text-center text-gray-500 py-6">No open trigger or limit orders.</p>
            )}

            {bottomTab === 'history' && (
              <>
                {loadingHistory && tradeHistory.length === 0 ? (
                  <p className="text-center text-gray-500 py-6">Loading trade history...</p>
                ) : tradeHistory.length === 0 ? (
                  <p className="text-center text-gray-500 py-6">Your closed trade settlements history will appear here.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-gray-500 uppercase border-b border-[#252525]">
                          <th className="pb-2">Time</th>
                          <th className="pb-2">Action</th>
                          <th className="pb-2">Size</th>
                          <th className="pb-2">Entry Price</th>
                          <th className="pb-2">Exit Price</th>
                          <th className="pb-2">Realized PnL</th>
                          <th className="pb-2 text-right">Settled Payout</th>
                        </tr>
                      </thead>
                      <tbody className="font-semibold divide-y divide-[#202020]">
                        {tradeHistory.map((trade, idx) => (
                          <tr key={idx} className="hover:bg-[#202020]/20 transition">
                            <td className="py-2.5 text-zinc-400">
                              {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                            <td className="py-2.5 flex items-center gap-1.5">
                              <span className={trade.isLong ? "text-tradeGreen font-extrabold" : "text-tradeRed font-extrabold"}>
                                {trade.isLong ? 'LONG' : 'SHORT'}
                              </span>
                              <span className="text-[9px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-400">{trade.leverage}x</span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                trade.type === 'Liquidated' ? 'bg-red-950 text-tradeRed border border-red-900' : 'bg-zinc-800 text-zinc-300'
                              }`}>
                                {trade.type}
                              </span>
                            </td>
                            <td className="py-2.5 text-white">${trade.size.toFixed(2)}</td>
                            <td className="py-2.5 text-zinc-400">${trade.entryPrice.toFixed(4)}</td>
                            <td className="py-2.5 text-zinc-400">${trade.exitPrice.toFixed(4)}</td>
                            <td className={`py-2.5 ${trade.pnl >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`}>
                              {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                            </td>
                            <td className="py-2.5 text-right text-white">${trade.payout.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Margin Modal within Trade view */}
      {selectedPos && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-cardBg border border-[#2a2a2a] rounded-xl w-full max-w-sm p-5 shadow-2xl relative">
            <h3 className="text-sm font-bold text-white mb-3">Add Position Margin</h3>
            <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
              Deposit more USDC into position **#{selectedPos.id}** to defend against liquidation.
            </p>

            <div className="mb-4">
              <label className="text-[10px] text-gray-400 block mb-1.5 uppercase">USDC Amount to Add</label>
              <input
                type="number"
                value={marginAmount}
                onChange={(e) => setMarginAmount(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-gray-500 rounded-lg py-2.5 px-4 text-white font-extrabold focus:outline-none text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <button
                onClick={() => setSelectedPos(null)}
                className="py-2 rounded-lg font-bold bg-[#252525] border border-[#3e3e3e] text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMargin}
                disabled={submittingMargin}
                className="py-2 rounded-lg font-bold bg-tradeGreen hover:bg-emerald-400 text-black transition"
              >
                {submittingMargin ? 'Depositing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TP/SL Configuration Modal */}
      {selectedPosForTPSL && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-cardBg border border-[#2a2a2a] rounded-xl w-full max-w-sm p-5 shadow-2xl relative">
            <h3 className="text-sm font-bold text-white mb-3">Configure TP / SL</h3>
            <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
              Set Take Profit and Stop Loss thresholds for position **#{selectedPosForTPSL.id}** ({selectedPosForTPSL.isLong ? 'LONG' : 'SHORT'}).
            </p>

            <div className="mb-4">
              <label className="text-[10px] text-gray-400 block mb-1.5 uppercase">Take Profit Price (USDC)</label>
              <input
                type="number"
                step="0.0001"
                value={editTPPrice}
                onChange={(e) => setEditTPPrice(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-gray-500 rounded-lg py-2.5 px-4 text-white font-extrabold focus:outline-none text-sm"
              />
            </div>

            <div className="mb-4">
              <label className="text-[10px] text-gray-400 block mb-1.5 uppercase">Stop Loss Price (USDC)</label>
              <input
                type="number"
                step="0.0001"
                value={editSLPrice}
                onChange={(e) => setEditSLPrice(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-gray-500 rounded-lg py-2.5 px-4 text-white font-extrabold focus:outline-none text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <button
                onClick={() => setSelectedPosForTPSL(null)}
                className="py-2 rounded-lg font-bold bg-[#252525] border border-[#3e3e3e] text-gray-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const tpslData = JSON.parse(localStorage.getItem(`tpsl_targets_${account}`) || '{}');
                  tpslData[selectedPosForTPSL.id] = {
                    takeProfit: parseFloat(editTPPrice) || 0,
                    stopLoss: parseFloat(editSLPrice) || 0,
                    isLong: selectedPosForTPSL.isLong
                  };
                  localStorage.setItem(`tpsl_targets_${account}`, JSON.stringify(tpslData));
                  addToast(`TP/SL configured for Position #${selectedPosForTPSL.id}! ✓`, "success");
                  setSelectedPosForTPSL(null);
                }}
                className="py-2 rounded-lg font-bold bg-tradeGreen hover:bg-emerald-400 text-black transition"
              >
                Save TP/SL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Premium Order Form */}
      <div className="bg-cardBg rounded-xl p-5 border border-[#2a2a2a] shadow-xl flex flex-col justify-between">
        <div>
          {/* Header Controls */}
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-extrabold text-gray-300 uppercase tracking-wider">Place Order</span>
            <span className="text-xs text-gray-500 font-bold px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
              Isolated Mode
            </span>
          </div>

          {/* Long/Short side-by-side tabs */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setIsLong(true)}
              className={`py-2.5 rounded-lg font-extrabold flex items-center justify-center gap-1.5 transition-all duration-200 border ${
                isLong
                  ? 'bg-tradeGreen hover:bg-emerald-400 text-black border-tradeGreen shadow-[0_0_12px_rgba(0,255,136,0.1)]'
                  : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              Buy / Long
            </button>
            <button
              onClick={() => setIsLong(false)}
              className={`py-2.5 rounded-lg font-extrabold flex items-center justify-center gap-1.5 transition-all duration-200 border ${
                !isLong
                  ? 'bg-tradeRed hover:bg-rose-500 text-white border-tradeRed shadow-[0_0_12px_rgba(255,68,68,0.1)]'
                  : 'bg-zinc-900 border-zinc-800 text-gray-400 hover:text-gray-200'
              }`}
            >
              Sell / Short
            </button>
          </div>

          {/* Market / Limit / Advanced Order Type Tabs */}
          
          <div className="flex border border-[#2a2a2a] mb-4 text-xs font-bold text-gray-400 bg-zinc-900/60 p-1 rounded-lg gap-1">
            <button
              onClick={() => setOrderType('market')}
              className={`flex-1 py-2 rounded-md transition-all duration-200 border ${
                orderType === 'market' 
                  ? 'bg-tradeGreen/10 text-tradeGreen border-tradeGreen/30 shadow-[0_0_8px_rgba(0,255,136,0.15)] font-extrabold' 
                  : 'bg-transparent border-transparent hover:text-white hover:bg-zinc-800/40'
              }`}
            >
              Market
            </button>
            <button
              onClick={() => setOrderType('limit')}
              className={`flex-1 py-2 rounded-md transition-all duration-200 border ${
                orderType === 'limit' 
                  ? 'bg-tradeGreen/10 text-tradeGreen border-tradeGreen/30 shadow-[0_0_8px_rgba(0,255,136,0.15)] font-extrabold' 
                  : 'bg-transparent border-transparent hover:text-white hover:bg-zinc-800/40'
              }`}
            >
              Limit
            </button>
            <button
              onClick={() => addToast("Advanced triggers are simulated.", "info")}
              className="flex-1 py-2 rounded-md bg-transparent border-transparent hover:text-white hover:bg-zinc-800/40 opacity-70 transition-all duration-200"
            >
              Advanced
            </button>
          </div>

          {/* Limit Price Input if Limit selected */}
          {orderType === 'limit' && (
            <div className="mb-4 animate-fadeIn">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1.5">Limit Price (USDC)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.0001"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-gray-500 rounded-lg py-2.5 px-4 text-white font-bold focus:outline-none text-sm"
                />
                <span className="absolute right-4 top-2.5 text-xs text-gray-500 font-extrabold">USDC</span>
              </div>
            </div>
          )}

          {/* Size input */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider">Order Size (USDC)</label>
              <span className="text-[10px] text-gray-500">Max size: 10k</span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-gray-500 rounded-lg py-2.5 px-4 text-white font-extrabold focus:outline-none text-sm"
              />
              <span className="absolute right-4 top-2.5 text-xs text-gray-500 font-extrabold">USDC</span>
            </div>
          </div>

          {/* Quick Balance Percentage selectors */}
          <div className="grid grid-cols-4 gap-1.5 mb-4 text-[10px] font-extrabold text-gray-400">
            {[10, 25, 50, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => {
                  const balNum = parseFloat(balance) || 0;
                  const calculatedSize = Math.min(10000, balNum * (pct / 100) * leverage);
                  setSize(calculatedSize > 0 ? calculatedSize.toFixed(0) : "100");
                  addToast(`Auto-scaled size to ${pct}% of balance!`, "info");
                }}
                className="py-1 rounded bg-[#252525] border border-[#3e3e3e] hover:bg-[#353535] hover:text-white transition duration-150"
              >
                {pct}%
              </button>
            ))}
          </div>

          {/* Leverage Slider */}
          <div className="mb-5">
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider">Leverage Preset</label>
              <span className="text-xs font-extrabold text-tradeGreen">{leverage}x</span>
            </div>
            <input
              type="range"
              min="2"
              max="10"
              value={leverage}
              onChange={(e) => setLeverage(parseInt(e.target.value))}
              className="w-full accent-tradeGreen bg-[#0f0f0f] rounded-lg appearance-none h-1.5 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-gray-500 font-bold mt-1">
              <span>2x</span>
              <span>4x</span>
              <span>6x</span>
              <span>8x</span>
              <span>10x</span>
            </div>
          </div>

          {/* Advanced Checkboxes */}
          <div className="space-y-2 mb-4 pt-3 border-t border-[#252525]">
            <label className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white cursor-pointer select-none">
              <input type="checkbox" className="rounded bg-[#0f0f0f] border-zinc-800 text-tradeGreen accent-tradeGreen w-3.5 h-3.5" />
              <span>Reduce Only</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white cursor-pointer select-none">
              <input 
                type="checkbox" 
                checked={tpslEnabled}
                onChange={(e) => setTpslEnabled(e.target.checked)}
                className="rounded bg-[#0f0f0f] border-zinc-800 text-tradeGreen accent-tradeGreen w-3.5 h-3.5" 
              />
              <span>TP / SL (Take Profit / Stop Loss)</span>
            </label>

            {tpslEnabled && (
              <div className="space-y-3 pt-2 pl-5 border-l border-zinc-800 animate-fadeIn">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-gray-500 font-extrabold uppercase">Take Profit (USDC)</span>
                    <span className="text-[9px] text-tradeGreen">Target Profit</span>
                  </div>
                  <input
                    type="number"
                    step="0.0001"
                    value={takeProfitPrice}
                    onChange={(e) => setTakeProfitPrice(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-gray-500 rounded-lg py-1.5 px-3 text-white font-extrabold focus:outline-none text-xs"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-gray-500 font-extrabold uppercase">Stop Loss (USDC)</span>
                    <span className="text-[9px] text-tradeRed">Target Loss</span>
                  </div>
                  <input
                    type="number"
                    step="0.0001"
                    value={stopLossPrice}
                    onChange={(e) => setStopLossPrice(e.target.value)}
                    className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-gray-500 rounded-lg py-1.5 px-3 text-white font-extrabold focus:outline-none text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Summary stats */}
          <div className="space-y-2 pt-3 border-t border-[#2a2a2a] text-xs font-semibold">
            <div className="flex justify-between text-gray-400">
              <span>Mark Price</span>
              <span className="font-bold text-white">${entryPrice.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Liquidation Price</span>
              <span 
                className={`font-bold transition-all duration-300 px-1 py-0.5 rounded ${
                  isCloseToLiquidation 
                    ? 'text-tradeRed animate-pulse-red border border-tradeRed/50' 
                    : 'text-white'
                }`}
              >
                ${liquidationPrice.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Required Margin</span>
              <span className="font-bold text-white">${marginNeeded.toFixed(2)} USDC</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Estimated Fees (0.1%)</span>
              <span className="font-bold text-white">${fee.toFixed(2)} USDC</span>
            </div>
          </div>
        </div>

        {/* Submit order */}
        <button
          onClick={async () => {
            if (orderType === 'limit') {
              const limitVal = parseFloat(limitPrice) || 0;
              // If limit price matches or crosses current market price, execute instantly on-chain!
              const isCrossed = isLong ? (limitVal >= currentPrice) : (limitVal <= currentPrice);
              if (isCrossed) {
                addToast(`Limit price crossed market price! Executing on OPN Testnet...`, "info");
                await handleOpenPosition();
              } else {
                addToast(`Limit order placed at $${limitPrice} USDC! ✓`, "success");
              }
            } else {
              await handleOpenPosition();
            }
          }}
          disabled={submitting}
          className={`w-full py-3.5 mt-5 rounded-xl font-extrabold text-black transition-all duration-200 transform hover:scale-[1.01] ${
            isLong 
              ? 'bg-tradeGreen hover:bg-emerald-400 shadow-emerald-950/20' 
              : 'bg-tradeRed hover:bg-rose-500 text-white'
          }`}
        >
          {submitting 
            ? 'Executing Transaction...' 
            : account 
            ? `${orderType === 'limit' ? 'Place Limit' : 'Open Market'} ${isLong ? 'Long' : 'Short'}` 
            : 'Connect Wallet'}
        </button>
      </div>
    </div>
  );
}
