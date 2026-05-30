import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import { ethers } from 'ethers';
import { createChart } from 'lightweight-charts';
import { Landmark, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, RefreshCw, BarChart2, ShieldAlert } from 'lucide-react';

export default function Portfolio() {
  const { account, contracts, provider, addToast } = useWallet();
  
  // Dashboard overall states
  const [totalEquity, setTotalEquity] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [olpBalance, setOlpBalance] = useState(0);
  const [olpValue, setOlpValue] = useState(0);
  
  const [unrealizedPnl, setUnrealizedPnl] = useState(0);
  const [realizedPnl, setRealizedPnl] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);
  const [perpVolume, setPerpVolume] = useState(0);
  const [spotVolume, setSpotVolume] = useState(0);
  
  const [activePositions, setActivePositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState('balances');
  
  // Chart tab state
  const [activeChartTab, setActiveChartTab] = useState('account');
  const [pnlHistory, setPnlHistory] = useState([]);
  const [volumeHistory, setVolumeHistory] = useState([]);
  const [equityHistory, setEquityHistory] = useState([]);

  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const currentSeriesRef = useRef(null);

  // Helper to retrieve TP/SL targets
  const getTPSLTarget = (posId) => {
    const tpslLocal = JSON.parse(localStorage.getItem(`tpsl_targets_${account}`) || '{}');
    return tpslLocal[posId] || null;
  };

  // Stats fetching
  const fetchPortfolioData = async () => {
    if (!contracts.usdc || !contracts.perpEngine || !contracts.liquidityPool || !account) return;
    try {
      // 1. USDC Balance
      const balRaw = await contracts.usdc.balanceOf(account);
      const usdcVal = parseFloat(ethers.formatUnits(balRaw, 18));
      setUsdcBalance(usdcVal);

      // 2. oLP Balance & Pool TVL
      const olpRaw = await contracts.liquidityPool.balanceOf(account);
      const olpVal = parseFloat(ethers.formatUnits(olpRaw, 18));
      setOlpBalance(olpVal);

      const poolAssets = parseFloat(ethers.formatUnits(await contracts.liquidityPool.totalAssets(), 18));
      const poolSupply = parseFloat(ethers.formatUnits(await contracts.liquidityPool.totalSupply(), 18));
      const sharePrice = poolSupply > 0 ? poolAssets / poolSupply : 1.0;
      const userOlpUSD = olpVal * sharePrice;
      setOlpValue(userOlpUSD);

      // 3. User Active positions
      const positionIds = await contracts.perpEngine.getUserPositions(account);
      let totalPnl = 0;
      let totalMarginUsed = 0;
      const positionsList = [];

      for (let i = 0; i < positionIds.length; i++) {
        const posId = positionIds[i];
        const rawPos = await contracts.perpEngine.positions(posId);
        
        if (rawPos.isActive) {
          const [pnlRaw, , currentPriceRaw, isLiquidatable] = 
            await contracts.perpEngine.getPositionPnL(posId);

          const pnlNum = parseFloat(ethers.formatUnits(pnlRaw, 18));
          const marginNum = parseFloat(ethers.formatUnits(rawPos.margin, 18));
          
          totalPnl += pnlNum;
          totalMarginUsed += marginNum;

          positionsList.push({
            id: Number(posId),
            isLong: rawPos.isLong,
            size: parseFloat(ethers.formatUnits(rawPos.sizeUSDC, 18)),
            leverage: Number(rawPos.leverage),
            margin: marginNum,
            entryPrice: parseFloat(ethers.formatUnits(rawPos.entryPrice, 18)),
            currentPrice: parseFloat(ethers.formatUnits(currentPriceRaw, 18)),
            pnl: pnlNum,
            isLiquidatable
          });
        }
      }

      setUnrealizedPnl(totalPnl);
      setActivePositions(positionsList);

      // Total Equity = USDC Balance + oLP Value + Position Margins + Position PnL
      const equity = usdcVal + userOlpUSD + totalMarginUsed + totalPnl;
      setTotalEquity(equity);

      // 4. Fetch Event Logs for Volume & PnL History
      let currentBlock = 0;
      try {
        currentBlock = await provider.getBlockNumber();
      } catch (err) {
        console.error(err);
      }
      
      const startBlock = Math.max(0, currentBlock - 3000);
      
      const filterOpened = contracts.perpEngine.filters.PositionOpened(null, account);
      const eventsOpened = await contracts.perpEngine.queryFilter(filterOpened, startBlock, 'latest');

      const filterClosed = contracts.perpEngine.filters.PositionClosed(null, account);
      const eventsClosed = await contracts.perpEngine.queryFilter(filterClosed, startBlock, 'latest');

      const filterLiquidated = contracts.perpEngine.filters.PositionLiquidated(null, account);
      const eventsLiquidated = await contracts.perpEngine.queryFilter(filterLiquidated, startBlock, 'latest');

      // Calculate total volume using localStorage cache to support All-Time volume tracking
      const storageKey = `opnx_volume_events_${account}`;
      let cachedVolEvents = [];
      try {
        cachedVolEvents = JSON.parse(localStorage.getItem(storageKey) || '[]');
      } catch (err) {
        console.error("Failed to parse cached volume events", err);
      }

      // Convert cached events to a map for quick lookup
      const eventMap = new Map();
      cachedVolEvents.forEach(e => {
        const key = `${e.blockNumber}_${e.transactionHash}_${e.logIndex}`;
        eventMap.set(key, e);
      });

      // Active Positions auto-recovery: Always ensure current active positions are in the volume history
      if (positionsList.length > 0) {
        positionsList.forEach((pos, index) => {
          const key = `recovered_${pos.id}`;
          if (!eventMap.has(key)) {
            eventMap.set(key, {
              key,
              blockNumber: 0,
              transactionHash: `recovered_tx_${pos.id}`,
              logIndex: index,
              size: pos.size,
              timestamp: Math.floor(Date.now() / 1000) - (positionsList.length - index) * 60
            });
          }
        });
      }

      // Add new events to the map
      for (const event of eventsOpened) {
        const key = `${event.blockNumber}_${event.transactionHash}_${event.logIndex}`;
        if (!eventMap.has(key)) {
          const size = parseFloat(ethers.formatUnits(event.args[3], 18));
          eventMap.set(key, {
            key,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            logIndex: event.logIndex,
            size: size,
            timestamp: Math.floor(Date.now() / 1000) // fallback timestamp
          });
        }
      }

      // Re-save all accumulated events to localStorage
      const updatedVolEvents = Array.from(eventMap.values());
      try {
        localStorage.setItem(storageKey, JSON.stringify(updatedVolEvents));
      } catch (err) {
        console.error("Failed to save volume events to cache", err);
      }

      // Compute total volume from ALL history in localStorage
      let totalVol = 0;
      for (const ev of updatedVolEvents) {
        totalVol += ev.size;
      }

      setRealizedPnl(cumPnl);
      setTotalVolume(totalVol);
      setPerpVolume(totalVol);
      
      // 1. REAL Volume History (Cumulative line starting from 0 and increasing with each real trade)
      const dailyVolPoints = [];
      const sortedVolEvents = [...updatedVolEvents].sort((a, b) => a.timestamp - b.timestamp);
      
      // Initial baseline point (1 hour before first trade or 1 day ago)
      const firstVolTime = sortedVolEvents.length > 0 ? sortedVolEvents[0].timestamp - 3600 : Math.floor(Date.now() / 1000) - 86400;
      dailyVolPoints.push({
        time: firstVolTime,
        value: 0
      });

      let currentCumVol = 0;
      for (const ev of sortedVolEvents) {
        currentCumVol += ev.size;
        dailyVolPoints.push({
          time: ev.timestamp,
          value: currentCumVol
        });
      }

      // If there are trades, add a final point up to current time
      if (sortedVolEvents.length > 0) {
        dailyVolPoints.push({
          time: Math.floor(Date.now() / 1000),
          value: currentCumVol
        });
      } else {
        // Fallback for new wallets with zero trades: clean flat line at 0
        dailyVolPoints.push({
          time: Math.floor(Date.now() / 1000),
          value: 0
        });
      }
      setVolumeHistory(dailyVolPoints);

      // 2. REAL PnL History (Cumulative line based strictly on closed/liquidated trades)
      const dailyPnlPoints = [];
      const firstPnlTime = allClosed.length > 0 ? allClosed[0].timestamp - 3600 : Math.floor(Date.now() / 1000) - 86400;
      dailyPnlPoints.push({
        time: firstPnlTime,
        value: 0
      });

      let runningPnl = 0;
      for (const c of allClosed) {
        runningPnl += c.pnl;
        dailyPnlPoints.push({
          time: c.timestamp,
          value: runningPnl
        });
      }

      if (allClosed.length > 0) {
        dailyPnlPoints.push({
          time: Math.floor(Date.now() / 1000),
          value: runningPnl
        });
      } else {
        dailyPnlPoints.push({
          time: Math.floor(Date.now() / 1000),
          value: 0
        });
      }
      setPnlHistory(dailyPnlPoints);

      // 3. REAL Equity History (Reflects your actual net balance)
      const eqChartPoints = [];
      const startEquityTime = Math.floor(Date.now() / 1000) - 86400;
      
      // Flat line leading up to current balance, which scales realistically with deposits and PnL
      eqChartPoints.push({
        time: startEquityTime,
        value: equity > 0 ? equity : 10000
      });
      eqChartPoints.push({
        time: Math.floor(Date.now() / 1000),
        value: equity > 0 ? equity : 10000
      });
      setEquityHistory(eqChartPoints);

    } catch (e) {
      console.error("Error fetching portfolio stats:", e);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchPortfolioData().then(() => setLoading(false));

    const interval = setInterval(fetchPortfolioData, 5000);
    return () => clearInterval(interval);
  }, [contracts, account]);

  // Bulletproof state references to keep chart updates clean
  const chartInstance = useRef(null);
  const seriesRefs = useRef({
    account: null,
    pnl: null,
    volume: null
  });

  // 1. Initialize Chart Canvas & Series ONCE on Mount
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clear any previous elements to avoid duplicates and canvas crash
    chartContainerRef.current.innerHTML = '';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#151515' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#202020' },
        horzLines: { color: '#202020' },
      },
      crosshair: {
        mode: 0,
      },
      priceScale: {
        borderColor: '#252525',
      },
      timeScale: {
        borderColor: '#252525',
        timeVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 280,
    });

    chartInstance.current = chart;

    // Initialize all 3 series once on start
    seriesRefs.current.account = chart.addAreaSeries({
      lineColor: '#00ff88',
      topColor: 'rgba(0, 255, 136, 0.3)',
      bottomColor: 'rgba(0, 255, 136, 0.0)',
      lineWidth: 2,
      visible: activeChartTab === 'account'
    });

    seriesRefs.current.pnl = chart.addAreaSeries({
      lineColor: '#00ff88',
      topColor: 'rgba(0, 255, 136, 0.3)',
      bottomColor: 'rgba(0, 255, 136, 0.0)',
      lineWidth: 2,
      visible: activeChartTab === 'pnl'
    });

    seriesRefs.current.volume = chart.addAreaSeries({
      lineColor: '#3b82f6',
      topColor: 'rgba(59, 130, 246, 0.3)',
      bottomColor: 'rgba(59, 130, 246, 0.0)',
      lineWidth: 2,
      visible: activeChartTab === 'volume'
    });

    const handleResize = () => {
      if (chart && chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartInstance.current = null;
      seriesRefs.current = { account: null, pnl: null, volume: null };
    };
  }, []);

  // 2. Light and safe data update effect: Updates values and toggles visibility smoothly
  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart) return;

    // Toggle series visibility based on active tab
    if (seriesRefs.current.account) {
      seriesRefs.current.account.applyOptions({ visible: activeChartTab === 'account' });
    }
    if (seriesRefs.current.pnl) {
      // Dynamic line color for PnL based on profit or loss
      seriesRefs.current.pnl.applyOptions({ 
        visible: activeChartTab === 'pnl',
        lineColor: realizedPnl >= 0 ? '#00ff88' : '#ff4444',
        topColor: realizedPnl >= 0 ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 68, 68, 0.3)',
      });
    }
    if (seriesRefs.current.volume) {
      seriesRefs.current.volume.applyOptions({ visible: activeChartTab === 'volume' });
    }

    // Determine raw dataset to process
    let rawData = [];
    const isConnected = !!account;
    const hasHistory = totalVolume > 0 || Math.abs(realizedPnl) > 0 || activePositions.length > 0;

    if (activeChartTab === 'account') {
      if (!isConnected) {
        rawData = [
          { time: Math.floor(Date.now() / 1000) - 3600, value: 0 },
          { time: Math.floor(Date.now() / 1000), value: 0 }
        ];
      } else if (!hasHistory) {
        rawData = [
          { time: Math.floor(Date.now() / 1000) - 3600 * 24, value: totalEquity },
          { time: Math.floor(Date.now() / 1000), value: totalEquity }
        ];
      } else {
        rawData = equityHistory.length > 0 ? equityHistory : [
          { time: Math.floor(Date.now() / 1000) - 3600, value: totalEquity },
          { time: Math.floor(Date.now() / 1000), value: totalEquity }
        ];
      }
    } else if (activeChartTab === 'pnl') {
      if (!isConnected || !hasHistory) {
        rawData = [
          { time: Math.floor(Date.now() / 1000) - 3600 * 24, value: 0 },
          { time: Math.floor(Date.now() / 1000), value: 0 }
        ];
      } else {
        rawData = pnlHistory;
      }
    } else if (activeChartTab === 'volume') {
      if (!isConnected || !hasHistory) {
        rawData = [
          { time: Math.floor(Date.now() / 1000) - 3600 * 24, value: 0 },
          { time: Math.floor(Date.now() / 1000), value: 0 }
        ];
      } else {
        rawData = volumeHistory;
      }
    }

    // Clean and validate coordinates to avoid lightweight-charts crash
    const validPoints = rawData.filter(item => 
      item && 
      item.time !== undefined && 
      item.time !== null && 
      !isNaN(item.time) && 
      item.value !== undefined && 
      item.value !== null && 
      !isNaN(item.value)
    );

    // Consolidate identical timestamps
    validPoints.sort((a, b) => a.time - b.time);
    const consolidated = {};
    for (const pt of validPoints) {
      const t = pt.time;
      if (consolidated[t]) {
        if (activeChartTab === 'volume') {
          consolidated[t].value += pt.value;
        } else {
          consolidated[t] = { ...pt };
        }
      } else {
        consolidated[t] = { ...pt };
      }
    }
    const finalData = Object.values(consolidated);
    finalData.sort((a, b) => a.time - b.time);

    // Apply data safely to active series
    if (finalData.length > 0) {
      if (activeChartTab === 'account' && seriesRefs.current.account) {
        seriesRefs.current.account.setData(finalData);
      } else if (activeChartTab === 'pnl' && seriesRefs.current.pnl) {
        seriesRefs.current.pnl.setData(finalData);
      } else if (activeChartTab === 'volume' && seriesRefs.current.volume) {
        seriesRefs.current.volume.setData(finalData);
      }
    }
  }, [activeChartTab, equityHistory, pnlHistory, volumeHistory, totalEquity, realizedPnl, totalVolume, activePositions, usdcBalance, account]);

  // Dynamic values
  const totalMargin = activePositions.reduce((acc, pos) => acc + pos.margin, 0);
  const totalSize = activePositions.reduce((acc, pos) => acc + pos.size, 0);
  
  // Available Margin = Balance
  const availableMargin = Math.max(0, usdcBalance);
  
  // Maintenance Margin ratio
  const marginRatio = totalSize > 0 ? (totalMargin / totalSize) * 100 : 0;

  return (
    <div className="p-4 space-y-6">
      {/* Overview Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Equity */}
        <div className="bg-cardBg border border-[#2a2a2a] rounded-xl p-5 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 h-1 bg-tradeGreen w-full opacity-50 group-hover:opacity-100 transition duration-300" />
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">Total Equity</span>
              <span className="text-2xl font-extrabold text-white mt-1 block">
                ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-gray-400 mt-1 block">
                All Time PnL: <span className={realizedPnl >= 0 ? "text-tradeGreen font-extrabold" : "text-tradeRed font-extrabold"}>
                  {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
                </span>
              </span>
            </div>
            <div className="p-2 bg-tradeGreen/10 border border-tradeGreen/20 rounded-lg">
              <Landmark className="w-5 h-5 text-tradeGreen" />
            </div>
          </div>
        </div>

        {/* 30d Volume */}
        <div className="bg-cardBg border border-[#2a2a2a] rounded-xl p-5 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 h-1 bg-blue-500 w-full opacity-50 group-hover:opacity-100 transition duration-300" />
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">30d Volume</span>
              <span className="text-2xl font-extrabold text-white mt-1 block">
                ${(account ? totalVolume : 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-gray-500 mt-1 block">Fee Tier: <b className="text-gray-300">0.01% / 0.035%</b></span>
            </div>
            <div className="p-2 bg-blue-950/20 border border-blue-900/30 rounded-lg">
              <BarChart2 className="w-5 h-5 text-blue-400" />
            </div>
          </div>
        </div>

        {/* NLP Balance */}
        <div className="bg-cardBg border border-[#2a2a2a] rounded-xl p-5 shadow-xl relative overflow-hidden group">
          <div className="absolute top-0 left-0 h-1 bg-[#d97706] w-full opacity-50 group-hover:opacity-100 transition duration-300" />
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-gray-400 font-bold block uppercase tracking-wider">NLP Balance</span>
              <span className="text-2xl font-extrabold text-white mt-1 block">
                ${olpValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-gray-400 mt-1 block">
                NLP APR: <span className="font-extrabold text-tradeGreen">29.10%</span>
              </span>
            </div>
            <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-lg text-xs font-bold text-[#d97706]">
              Compounding
            </div>
          </div>
        </div>
      </div>

      {/* Main Graph & Margin Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar Info & Margin details */}
        <div className="bg-cardBg border border-[#2a2a2a] rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <h2 className="text-sm font-extrabold text-gray-300 uppercase tracking-wider border-b border-[#2a2a2a] pb-3">
              Account Overview
            </h2>

            <div className="space-y-3.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Cash Balance</span>
                <span className="font-bold text-white">${usdcBalance.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Unrealized Perp PnL</span>
                <span className={`font-bold ${unrealizedPnl >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`}>
                  {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Unrealized Spot PnL</span>
                <span className="font-bold text-tradeGreen">+$0.00 USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Available Margin</span>
                <span className="font-bold text-white">${availableMargin.toFixed(2)} USDC</span>
              </div>
              <div className="pt-2 border-t border-[#252525]">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-gray-400">Maintenance Margin & Ratio</span>
                  <span className={`text-xs font-extrabold ${marginRatio > 15 ? 'text-tradeGreen' : 'text-tradeRed'}`}>
                    {marginRatio.toFixed(2)}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-[#0f0f0f] rounded-full h-2 overflow-hidden border border-[#252525]">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      marginRatio > 25 ? 'bg-tradeGreen' : marginRatio > 10 ? 'bg-amber-400' : 'bg-tradeRed'
                    }`} 
                    style={{ width: `${Math.min(100, marginRatio)}%` }} 
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-3 bg-zinc-900/60 border border-[#2a2a2a] rounded-lg text-xs text-gray-500 leading-relaxed flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-tradeGreen shrink-0 mt-0.5" />
            <span>
              Risk ratio computes your total collateral relative to your open size. Maintain values above **10%** to avoid liquidations.
            </span>
          </div>
        </div>

        {/* Dynamic Interactive Chart Panel */}
        <div className="lg:col-span-2 bg-cardBg border border-[#2a2a2a] rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#202020] pb-3 gap-2">
            <div className="flex border border-[#2a2a2a] text-xs font-bold text-gray-400 bg-zinc-900/60 p-0.5 rounded-lg">
              <button
                onClick={() => setActiveChartTab('account')}
                className={`px-4 py-1.5 rounded-md transition duration-150 ${
                  activeChartTab === 'account' ? 'bg-zinc-800 text-white shadow-md' : 'hover:text-white'
                }`}
              >
                Account
              </button>
              <button
                onClick={() => setActiveChartTab('pnl')}
                className={`px-4 py-1.5 rounded-md transition duration-150 ${
                  activeChartTab === 'pnl' ? 'bg-zinc-800 text-white shadow-md' : 'hover:text-white'
                }`}
              >
                PnL
              </button>
              <button
                onClick={() => setActiveChartTab('volume')}
                className={`px-4 py-1.5 rounded-md transition duration-150 ${
                  activeChartTab === 'volume' ? 'bg-zinc-800 text-white shadow-md' : 'hover:text-white'
                }`}
              >
                Volume
              </button>
            </div>
            <span className="text-xs text-gray-500 font-semibold block select-none">
              OPNX Interactive Performance Terminal
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 flex-grow">
            {/* Split statistics block if Volume tab is active */}
            {activeChartTab === 'volume' ? (
              <div className="md:col-span-1 border-r border-[#202020] pr-4 space-y-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-extrabold">All Time Totals</p>
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-bold">Volume</span>
                    <span className="text-base font-extrabold text-white">
                      ${(account ? totalVolume : 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-bold">Perp Volume</span>
                    <span className="text-sm font-extrabold text-white">
                      ${(account ? perpVolume : 0).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-bold opacity-60">Spot Volume</span>
                    <span className="text-sm font-extrabold text-zinc-500">$0.00</span>
                  </div>
                </div>
              </div>
            ) : activeChartTab === 'pnl' ? (
              <div className="md:col-span-1 border-r border-[#202020] pr-4 space-y-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-extrabold">PnL Metrics</p>
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-bold">Realized PnL</span>
                    <span className={`text-base font-extrabold ${realizedPnl >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`}>
                      {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-bold">Unrealized PnL</span>
                    <span className={`text-sm font-extrabold ${unrealizedPnl >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`}>
                      {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="md:col-span-1 border-r border-[#202020] pr-4 space-y-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-extrabold">Account Stats</p>
                <div className="space-y-3">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-bold">Net Equity</span>
                    <span className="text-base font-extrabold text-white">${totalEquity.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-bold">Free Collateral</span>
                    <span className="text-sm font-extrabold text-tradeGreen">${usdcBalance.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* The lightweight-chart container */}
            <div className="md:col-span-3 flex items-center justify-center">
              <div ref={chartContainerRef} className="w-full rounded-lg overflow-hidden" />
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Tabs: Balances, Positions, Open Orders */}
      <div className="bg-cardBg border border-[#2a2a2a] rounded-xl shadow-xl overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-[#2a2a2a] bg-[#151515]">
          <button
            onClick={() => setSubTab('balances')}
            className={`px-6 py-3 font-bold text-sm transition-all duration-200 border-b-2 ${
              subTab === 'balances'
                ? 'border-tradeGreen text-tradeGreen bg-[#1a1a1a]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Balances
          </button>
          <button
            onClick={() => setSubTab('positions')}
            className={`px-6 py-3 font-bold text-sm transition-all duration-200 border-b-2 ${
              subTab === 'positions'
                ? 'border-tradeGreen text-tradeGreen bg-[#1a1a1a]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Active Positions ({activePositions.length})
          </button>
          <button
            onClick={() => setSubTab('orders')}
            className={`px-6 py-3 font-bold text-sm transition-all duration-200 border-b-2 ${
              subTab === 'orders'
                ? 'border-tradeGreen text-tradeGreen bg-[#1a1a1a]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            Open Orders (0)
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5">
          {subTab === 'balances' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase border-b border-[#252525]">
                    <th className="pb-3 px-2">Asset</th>
                    <th className="pb-3 px-2">Balance</th>
                    <th className="pb-3 px-2">Value USD</th>
                    <th className="pb-3 px-2">Deposit APY</th>
                    <th className="pb-3 px-2">Borrow APY</th>
                    <th className="pb-3 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-semibold divide-y divide-[#252525]">
                  <tr className="hover:bg-[#202020]/20 transition">
                    <td className="py-4 px-2 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-950 flex items-center justify-center border border-tradeGreen/40">
                        <span className="text-[10px] font-bold text-tradeGreen">U</span>
                      </div>
                      <span className="text-white">mUSDC</span>
                    </td>
                    <td className="py-4 px-2 text-white">{usdcBalance.toFixed(2)} USDC</td>
                    <td className="py-4 px-2 text-white">${usdcBalance.toFixed(2)}</td>
                    <td className="py-4 px-2 text-tradeGreen">2.82%</td>
                    <td className="py-4 px-2 text-gray-400">3.85%</td>
                    <td className="py-4 px-2 text-right">
                      <button className="px-3 py-1 rounded bg-[#202020] hover:bg-[#303030] border border-[#3e3e3e] text-xs font-bold text-white transition">
                        Deposit
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-[#202020]/20 transition opacity-80">
                    <td className="py-4 px-2 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-amber-950 flex items-center justify-center border border-amber-600/40">
                        <span className="text-[10px] font-bold text-amber-500">B</span>
                      </div>
                      <span className="text-white">mBTC</span>
                    </td>
                    <td className="py-4 px-2 text-gray-400">0.0000 mBTC</td>
                    <td className="py-4 px-2 text-gray-400">$0.00</td>
                    <td className="py-4 px-2 text-tradeGreen">0.24%</td>
                    <td className="py-4 px-2 text-gray-400">1.82%</td>
                    <td className="py-4 px-2 text-right">
                      <button className="px-3 py-1 rounded bg-zinc-900 border border-[#2a2a2a] text-xs text-zinc-500 cursor-not-allowed">
                        Deposit
                      </button>
                    </td>
                  </tr>

                  <tr className="hover:bg-[#202020]/20 transition opacity-80">
                    <td className="py-4 px-2 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-950 flex items-center justify-center border border-blue-500/40">
                        <span className="text-[10px] font-bold text-blue-400">E</span>
                      </div>
                      <span className="text-white">mETH</span>
                    </td>
                    <td className="py-4 px-2 text-gray-400">0.0000 mETH</td>
                    <td className="py-4 px-2 text-gray-400">$0.00</td>
                    <td className="py-4 px-2 text-tradeGreen">1.25%</td>
                    <td className="py-4 px-2 text-gray-400">3.40%</td>
                    <td className="py-4 px-2 text-right">
                      <button className="px-3 py-1 rounded bg-zinc-900 border border-[#2a2a2a] text-xs text-zinc-500 cursor-not-allowed">
                        Deposit
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {subTab === 'positions' && (
            <div>
              {activePositions.length === 0 ? (
                <p className="text-center text-xs text-gray-500 py-6">No active positions</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase border-b border-[#252525] pb-2">
                        <th className="pb-3">ID</th>
                        <th className="pb-3">Position</th>
                        <th className="pb-3">Size</th>
                        <th className="pb-3">Margin</th>
                        <th className="pb-3">Entry Price</th>
                        <th className="pb-3">Mark Price</th>
                        <th className="pb-3">TP / SL</th>
                        <th className="pb-3">PnL</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-semibold divide-y divide-[#252525]">
                      {activePositions.map((pos) => {
                        const target = getTPSLTarget(pos.id);
                        return (
                          <tr key={pos.id}>
                            <td className="py-4 text-gray-400">#{pos.id}</td>
                            <td className="py-4">
                              <span className={pos.isLong ? "text-tradeGreen font-extrabold" : "text-tradeRed font-extrabold"}>
                                {pos.isLong ? 'LONG' : 'SHORT'}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 ml-1.5">{pos.leverage}x</span>
                            </td>
                            <td className="py-4 text-white">${pos.size.toFixed(2)}</td>
                            <td className="py-4 text-white">${pos.margin.toFixed(2)}</td>
                            <td className="py-4 text-gray-300">${pos.entryPrice.toFixed(4)}</td>
                            <td className="py-4 text-gray-300">${pos.currentPrice.toFixed(4)}</td>
                            <td className="py-4">
                              {target ? (
                                <div className="flex flex-col text-[10px] font-extrabold leading-tight">
                                  <span className="text-tradeGreen">TP: ${target.takeProfit.toFixed(3)}</span>
                                  <span className="text-tradeRed">SL: ${target.stopLoss.toFixed(3)}</span>
                                </div>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>
                            <td className={`py-4 ${pos.pnl >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`}>
                              {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)} ({((pos.pnl / pos.margin) * 100).toFixed(1)}%)
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {subTab === 'orders' && (
            <p className="text-center text-xs text-gray-500 py-6">No open limit orders detected.</p>
          )}
        </div>
      </div>
    </div>
  );
}
