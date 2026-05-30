import React, { useState, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { ethers } from 'ethers';
import { PlusCircle, XCircle, ArrowUpRight, ArrowDownRight, RefreshCw, Clock } from 'lucide-react';

export default function Positions() {
  const { account, contracts, provider, addToast } = useWallet();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fundingTimer, setFundingTimer] = useState("00:00");
  const [blocksToFunding, setBlocksToFunding] = useState(100);
  
  // Modal states for add margin
  const [selectedPos, setSelectedPos] = useState(null);
  const [marginAmount, setMarginAmount] = useState('50');
  const [submittingMargin, setSubmittingMargin] = useState(false);

  const fetchPositions = async () => {
    if (!contracts.perpEngine || !account) return;
    try {
      const positionIds = await contracts.perpEngine.getUserPositions(account);
      const activePositions = [];

      for (let i = 0; i < positionIds.length; i++) {
        const posId = positionIds[i];
        const rawPos = await contracts.perpEngine.positions(posId);
        
        if (rawPos.isActive) {
          // Get live PnL and liquidation state
          const [pnlRaw, fundingRaw, currentPriceRaw, isLiquidatable] = 
            await contracts.perpEngine.getPositionPnL(posId);

          activePositions.push({
            id: Number(posId),
            isLong: rawPos.isLong,
            size: parseFloat(ethers.formatUnits(rawPos.sizeUSDC, 18)),
            leverage: Number(rawPos.leverage),
            margin: parseFloat(ethers.formatUnits(rawPos.margin, 18)),
            entryPrice: parseFloat(ethers.formatUnits(rawPos.entryPrice, 18)),
            currentPrice: parseFloat(ethers.formatUnits(currentPriceRaw, 18)),
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

  const fetchFundingDetails = async () => {
    if (!contracts.fundingRate || !provider) return;
    try {
      const currentBlock = await provider.getBlockNumber();
      const lastFunding = Number(await contracts.fundingRate.lastFundingBlock());
      const interval = Number(await contracts.fundingRate.FUNDING_INTERVAL());
      
      const nextFundingBlock = lastFunding + interval;
      const blocksRemaining = nextFundingBlock > currentBlock ? nextFundingBlock - currentBlock : 0;
      setBlocksToFunding(blocksRemaining);

      // Estimate time: OPN block time is roughly 2s
      const secondsRemaining = blocksRemaining * 2;
      const mins = Math.floor(secondsRemaining / 60);
      const secs = secondsRemaining % 60;
      setFundingTimer(
        `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      );
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchPositions().then(() => setLoading(false));
    fetchFundingDetails();

    const interval = setInterval(() => {
      fetchPositions();
      fetchFundingDetails();
    }, 5000);

    return () => clearInterval(interval);
  }, [contracts, account, provider]);

  const handleClosePosition = async (id) => {
    if (!contracts.perpEngine) return;
    try {
      addToast(`Closing position #${id}...`, "info");
      const tx = await contracts.perpEngine.closePosition(id);
      await tx.wait();
      fetchPositions();
    } catch (e) {
      console.error(e);
      addToast("Close transaction failed or was rejected.", "error");
    }
  };

  const handleAddMargin = async () => {
    if (!contracts.perpEngine || !contracts.usdc || !selectedPos) return;
    setSubmittingMargin(true);
    try {
      const amountUnits = ethers.parseUnits(marginAmount, 18);
      
      // Approve margin amount if needed
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
      addToast("Checking liquidation condition...", "info");
      const tx = await contracts.perpEngine.liquidate(id);
      await tx.wait();
      addToast("✓ Liquidated underwater position!", "success");
      fetchPositions();
    } catch (e) {
      console.error(e);
      addToast("Cannot liquidate. Position is not underwater (margin remaining is safe).", "warning");
    }
  };

  return (
    <div className="p-4 space-y-6">
      {/* Top Bar with Timer */}
      <div className="flex justify-between items-center bg-cardBg border border-[#2a2a2a] rounded-xl p-5 shadow-xl">
        <div>
          <h1 className="text-xl font-bold tracking-wide text-gray-200">Open Positions</h1>
          <p className="text-xs text-gray-400 mt-1">Updates live every 5 seconds</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#252525] border border-[#3e3e3e]">
            <Clock className="w-4 h-4 text-tradeGreen animate-pulse" />
            <span className="text-xs text-gray-400">Next Funding Block:</span>
            <span className="text-sm font-extrabold text-tradeGreen">{blocksToFunding} blocks ({fundingTimer})</span>
          </div>
          <button 
            onClick={() => { setLoading(true); fetchPositions().then(() => setLoading(false)); }} 
            className="p-2 rounded-lg bg-[#252525] border border-[#3e3e3e] hover:bg-[#323232] transition duration-200"
          >
            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Positions Table */}
      <div className="bg-cardBg border border-[#2a2a2a] rounded-xl shadow-xl overflow-hidden">
        {positions.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-25" />
            <p className="text-base font-medium">No open positions detected</p>
            <p className="text-xs mt-1">Open a new position on the trading terminal to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2a2a2a] text-xs text-gray-400 uppercase bg-[#202020]/50">
                  <th className="py-4 px-5">ID</th>
                  <th className="py-4 px-5">Position</th>
                  <th className="py-4 px-5">Size</th>
                  <th className="py-4 px-5">Margin</th>
                  <th className="py-4 px-5">Entry Price</th>
                  <th className="py-4 px-5">Mark Price</th>
                  <th className="py-4 px-5">Funding Paid/Recv</th>
                  <th className="py-4 px-5">PnL</th>
                  <th className="py-4 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a2a] text-sm font-semibold">
                {positions.map((pos) => {
                  const pnlPercent = (pos.pnl / pos.margin) * 100;
                  return (
                    <tr key={pos.id} className="hover:bg-[#202020]/20 transition duration-150">
                      <td className="py-4 px-5 text-gray-400">#{pos.id}</td>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-1.5">
                          {pos.isLong ? (
                            <>
                              <ArrowUpRight className="w-4 h-4 text-tradeGreen" />
                              <span className="text-tradeGreen font-bold">LONG</span>
                            </>
                          ) : (
                            <>
                              <ArrowDownRight className="w-4 h-4 text-tradeRed" />
                              <span className="text-tradeRed font-bold">SHORT</span>
                            </>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{pos.leverage}x</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-white">${pos.size.toFixed(2)}</td>
                      <td className="py-4 px-5 text-white">${pos.margin.toFixed(2)}</td>
                      <td className="py-4 px-5 text-gray-300">${pos.entryPrice.toFixed(4)}</td>
                      <td className="py-4 px-5 text-gray-300">${pos.currentPrice.toFixed(4)}</td>
                      <td className={`py-4 px-5 ${pos.funding >= 0 ? 'text-tradeRed' : 'text-tradeGreen'}`}>
                        {pos.funding >= 0 ? '-' : '+'}${Math.abs(pos.funding).toFixed(4)}
                      </td>
                      <td className={`py-4 px-5 ${pos.pnl >= 0 ? 'text-tradeGreen' : 'text-tradeRed'}`}>
                        <span className="font-extrabold">
                          {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                        </span>
                        <span className="text-xs font-medium ml-1.5">
                          ({pos.pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setSelectedPos(pos)}
                            className="px-3 py-1.5 rounded bg-[#252525] border border-[#3e3e3e] hover:bg-[#353535] text-xs font-bold transition duration-200"
                          >
                            Add Margin
                          </button>
                          
                          {/* Liquidate Simulation button */}
                          {pos.isLiquidatable ? (
                            <button
                              onClick={() => handleLiquidateDemo(pos.id)}
                              className="px-3 py-1.5 rounded bg-tradeRed hover:bg-rose-600 text-white text-xs font-bold transition duration-200 animate-bounce"
                            >
                              ☠ Liquidate
                            </button>
                          ) : (
                            <button
                              onClick={() => handleClosePosition(pos.id)}
                              className="px-3 py-1.5 rounded bg-[#331111]/30 hover:bg-[#ff4444]/20 text-tradeRed border border-[#ff4444]/30 text-xs font-bold transition duration-200"
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
      </div>

      {/* Add Margin Modal */}
      {selectedPos && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-cardBg border border-[#2a2a2a] rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-4">Add Position Margin</h3>
            <p className="text-xs text-gray-400 mb-5">
              Increase the margin of your **#{selectedPos.id}** position to push your liquidation price further away.
            </p>

            <div className="mb-5">
              <label className="text-xs text-gray-400 block mb-2">USDC Amount to Add</label>
              <input
                type="number"
                value={marginAmount}
                onChange={(e) => setMarginAmount(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] focus:border-gray-500 rounded-lg py-3 px-4 text-white font-bold focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSelectedPos(null)}
                className="py-2.5 rounded-lg font-bold bg-[#252525] border border-[#3e3e3e] text-gray-400 hover:text-white transition duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMargin}
                disabled={submittingMargin}
                className="py-2.5 rounded-lg font-bold bg-tradeGreen hover:bg-emerald-400 text-black transition duration-200"
              >
                {submittingMargin ? 'Adding...' : 'Confirm Margin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
