import React, { useState } from 'react';
import { WalletProvider, useWallet } from './context/WalletContext';
import Portfolio from './pages/Portfolio';
import Trade from './pages/Trade';
import Positions from './pages/Positions';
import Pool from './pages/Pool';
import Leaderboard from './pages/Leaderboard';
import { TrendingUp, Award, Database, ListCollapse, Wallet, ShieldAlert, Sparkles } from 'lucide-react';

function Dashboard() {
  const [activeTab, setActiveTab] = useState('portfolio');
  const { account, connectWallet, toasts, removeToast } = useWallet();

  const renderContent = () => {
    switch (activeTab) {
      case 'portfolio':
        return <Portfolio />;
      case 'trade':
        return <Trade />;
      case 'positions':
        return <Positions />;
      case 'pool':
        return <Pool />;
      case 'leaderboard':
        return <Leaderboard />;
      default:
        return <Portfolio />;
    }
  };

  return (
    <div className="min-h-screen bg-darkBg text-white flex flex-col justify-between">
      {/* Navigation Header */}
      <header className="border-b border-[#2a2a2a] bg-[#121212] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('portfolio')}>
            <div className="p-1.5 bg-zinc-950 border-2 border-tradeGreen rounded-xl flex items-center justify-center shadow-[0_0_10px_rgba(0,255,136,0.25)]">
              <svg
                className="w-4 h-4 text-tradeGreen"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-widest bg-gradient-to-r from-white to-tradeGreen bg-clip-text text-transparent">
                OPNX
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setActiveTab('portfolio')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${
                activeTab === 'portfolio'
                  ? 'bg-tradeGreen/10 text-tradeGreen border border-tradeGreen/30'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('trade')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${
                activeTab === 'trade'
                  ? 'bg-tradeGreen/10 text-tradeGreen border border-tradeGreen/30'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              Trade
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${
                activeTab === 'positions'
                  ? 'bg-tradeGreen/10 text-tradeGreen border border-tradeGreen/30'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              Positions
            </button>
            <button
              onClick={() => setActiveTab('pool')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${
                activeTab === 'pool'
                  ? 'bg-tradeGreen/10 text-tradeGreen border border-tradeGreen/30'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              Liquidity Pool
            </button>
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 ${
                activeTab === 'leaderboard'
                  ? 'bg-tradeGreen/10 text-tradeGreen border border-tradeGreen/30'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              Leaderboard
            </button>
          </nav>

          {/* Connect Wallet */}
          <div>
            {account ? (
              <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cardBg border border-tradeGreen/50 text-tradeGreen font-bold text-sm shadow-[0_0_12px_rgba(0,255,136,0.15)] transition duration-200">
                <div className="w-2 h-2 rounded-full bg-tradeGreen animate-ping" />
                <span>{account.substring(0, 6)}...{account.substring(account.length - 4)}</span>
              </button>
            ) : (
              <button
                onClick={connectWallet}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-tradeGreen hover:bg-emerald-400 text-black font-extrabold text-sm transition-all duration-200"
              >
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-2 md:p-6">
        {renderContent()}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2a2a2a] py-6 text-center text-xs text-gray-500 bg-[#0c0c0c] mt-12">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© 2026 OPNX. All rights reserved.</p>
          <div className="flex gap-4 font-bold text-gray-400">
            <span className="hover:text-tradeGreen cursor-pointer">Security Audited</span>
            <span>•</span>
            <span className="hover:text-tradeGreen cursor-pointer">Terms of Use</span>
          </div>
        </div>
      </footer>

      {/* Floating Global Toast notifications container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className={`cursor-pointer p-4 rounded-xl border shadow-2xl flex items-center justify-between transition-all duration-300 transform translate-y-0 scale-100 hover:scale-[1.02] text-sm font-bold ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-tradeGreen text-tradeGreen shadow-emerald-950/20'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500 text-amber-500'
                : toast.type === 'error'
                ? 'bg-rose-950/90 border-tradeRed text-tradeRed shadow-rose-950/20'
                : 'bg-zinc-900/90 border-[#3e3e3e] text-zinc-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'error' && <ShieldAlert className="w-5 h-5 text-tradeRed animate-bounce" />}
              <span>{toast.message}</span>
            </div>
            <button className="text-xs opacity-60 hover:opacity-100 ml-4 font-bold">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <Dashboard />
    </WalletProvider>
  );
}
