import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { Award, Trophy, ThumbsUp, Medal, ExternalLink } from 'lucide-react';

export default function Leaderboard() {
  const { account } = useWallet();
  const [votes, setVotes] = useState({
    1: 42,
    2: 38,
    3: 31,
    4: 19,
    5: 12
  });

  const [hasVoted, setHasVoted] = useState({});

  const handleVote = (id) => {
    if (hasVoted[id]) return;
    setVotes((prev) => ({
      ...prev,
      [id]: prev[id] + 1
    }));
    setHasVoted((prev) => ({
      ...prev,
      [id]: true
    }));
  };

  const topTraders = [
    {
      rank: 1,
      id: 1,
      address: "0x8F94...45Cd",
      volume: 1254300,
      winRate: 78,
      pnl: 14520,
    },
    {
      rank: 2,
      id: 2,
      address: "0x3dA2...9f83",
      volume: 852100,
      winRate: 72,
      pnl: 9840,
    },
    {
      rank: 3,
      id: 3,
      address: "0xaF19...320c",
      volume: 642000,
      winRate: 68,
      pnl: 5410,
    },
    {
      rank: 4,
      id: 4,
      address: "0xEe4b...B0d4",
      volume: 380400,
      winRate: 64,
      pnl: 2890,
    },
    {
      rank: 5,
      id: 5,
      address: "0x539c...6CdA",
      volume: 241000,
      winRate: 59,
      pnl: 1420,
    }
  ];

  return (
    <div className="p-4 space-y-6 max-w-4xl mx-auto">
      {/* Banner */}
      <div className="bg-cardBg border border-[#2a2a2a] rounded-xl p-6 shadow-xl flex items-center gap-5">
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
          <Trophy className="w-10 h-10 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-wide text-gray-200">Trader Leaderboard</h1>
          <p className="text-xs text-gray-400 mt-1">
            Ranked by realized PnL. Top traders drive governance and community reward votes!
          </p>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-cardBg border border-[#2a2a2a] rounded-xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#2a2a2a] text-xs text-gray-400 uppercase bg-[#202020]/50">
                <th className="py-4 px-5 w-16">Rank</th>
                <th className="py-4 px-5">Trader Address</th>
                <th className="py-4 px-5">Trading Volume</th>
                <th className="py-4 px-5">Win Rate</th>
                <th className="py-4 px-5 text-tradeGreen">Realized PnL</th>
                <th className="py-4 px-5 text-right">Community Votes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2a2a] text-sm font-semibold">
              {topTraders.map((trader) => {
                const isUser = account && account.substring(0, 6).toLowerCase() === trader.address.substring(0, 6).toLowerCase();
                return (
                  <tr 
                    key={trader.rank} 
                    className={`hover:bg-[#202020]/20 transition duration-150 ${
                      isUser ? 'bg-tradeGreen/5 border-l-2 border-tradeGreen' : ''
                    }`}
                  >
                    <td className="py-4 px-5">
                      <div className="flex items-center justify-center">
                        {trader.rank === 1 && <Trophy className="w-5 h-5 text-amber-400" />}
                        {trader.rank === 2 && <Medal className="w-5 h-5 text-slate-300" />}
                        {trader.rank === 3 && <Medal className="w-5 h-5 text-amber-700" />}
                        {trader.rank > 3 && <span className="text-gray-400">#{trader.rank}</span>}
                      </div>
                    </td>
                    <td className="py-4 px-5">
                      <span className="font-mono text-white flex items-center gap-1.5">
                        {trader.address}
                        <ExternalLink className="w-3.5 h-3.5 text-gray-500 opacity-60 hover:opacity-100 cursor-pointer" />
                      </span>
                    </td>
                    <td className="py-4 px-5 text-gray-300">${trader.volume.toLocaleString()}</td>
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-[#0f0f0f] rounded-full h-1.5 overflow-hidden border border-[#2a2a2a]">
                          <div className="bg-tradeGreen h-full" style={{ width: `${trader.winRate}%` }} />
                        </div>
                        <span className="text-xs">{trader.winRate}%</span>
                      </div>
                    </td>
                    <td className="py-4 px-5 text-tradeGreen">
                      +${trader.pnl.toLocaleString()}
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-xs text-gray-400">{votes[trader.id]} votes</span>
                        <button
                          onClick={() => handleVote(trader.id)}
                          disabled={hasVoted[trader.id]}
                          className={`p-1.5 rounded-lg border flex items-center gap-1.5 text-xs font-bold transition duration-200 ${
                            hasVoted[trader.id]
                              ? 'bg-tradeGreen/10 border-tradeGreen/30 text-tradeGreen cursor-default'
                              : 'bg-[#252525] border-[#3e3e3e] hover:bg-[#353535] text-gray-300 hover:text-white'
                          }`}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span>{hasVoted[trader.id] ? 'Voted' : 'Vote'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info card */}
      <div className="bg-[#202020]/20 border border-[#2a2a2a] rounded-xl p-5 shadow-inner text-xs text-gray-400 leading-relaxed">
        💡 **Leaderboard Rules**: realized PnL is compiled every 24 hours. The highest voted trader of the week earns 10% pool reward boosts, directly distributed from the Insurance Fund! Connect your wallet and execute trades on the OPN testnet to rank.
      </div>
    </div>
  );
}
