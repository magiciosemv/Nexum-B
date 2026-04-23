import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAnchorContext } from "./context/WalletProvider";
import { WalletContextProvider } from "./context/WalletProvider";
import SettleBPage from "./pages/settle-b";
import MakerDashboard from "./pages/maker-dashboard";

function ConnectButton() {
  const { connected, publicKey } = useAnchorContext();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <span className="text-sm font-mono text-green-600 bg-green-50 px-3 py-1 rounded">
        {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
      </span>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)}
      className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded transition-colors"
    >
      Connect Wallet
    </button>
  );
}

function AppInner() {
  const { program, connected } = useAnchorContext();

  return (
    <BrowserRouter>
      <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-6">
        <Link to="/" className="text-sm font-medium text-gray-700 hover:text-blue-600">
          Settlement
        </Link>
        <Link to="/maker" className="text-sm font-medium text-gray-700 hover:text-blue-600">
          Maker Dashboard
        </Link>
        <div className="flex-1" />
        <ConnectButton />
      </nav>

      {!connected && (
        <div className="max-w-md mx-auto mt-20 text-center">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Nexum Protocol</h2>
          <p className="text-gray-500 mb-6">
            Private OTC settlement on Solana using ZK proofs.
            Connect your wallet to begin.
          </p>
        </div>
      )}

      {connected && !program && (
        <div className="max-w-md mx-auto mt-20 text-center">
          <p className="text-amber-600">Wallet connected but program not loaded. Check your network.</p>
        </div>
      )}

      {connected && program && (
        <Routes>
          <Route path="/" element={<SettleBPage />} />
          <Route path="/maker" element={<MakerDashboard />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <WalletContextProvider>
      <AppInner />
    </WalletContextProvider>
  );
}
