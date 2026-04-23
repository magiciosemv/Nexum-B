/**
 * WalletProvider — Solana wallet connection context
 *
 * Wraps @solana/wallet-adapter-react with Anchor Program initialization.
 * Provides wallet, program, and connection to all child components.
 *
 * Supports Phantom, Solflare, and Coinbase Wallet.
 * Falls back to local validator (localhost:8899) for development.
 */

import React, { useMemo, FC, ReactNode } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Idl, Wallet } from "@coral-xyz/anchor";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
  useWallet as useSolanaWallet,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";

import IDL from "../idl/nexum_pool.json";

// ── Configuration ─────────────────────────────────────────────────────

const ENDPOINT =
  import.meta.env.VITE_SOLANA_RPC_URL ||
  "http://127.0.0.1:8899";

// Program IDs (must match Anchor.toml and deployed programs)
const NEXUM_POOL_ID = new PublicKey("BN9cg69CyigYuczJNjK3MVWRHdVMELaN55wpJz8KKi4P");

// ── Context Types ─────────────────────────────────────────────────────

export interface AnchorContextValue {
  program: Program | null;
  wallet: Wallet | null;
  connected: boolean;
  publicKey: PublicKey | null;
}

const AnchorContext = React.createContext<AnchorContextValue>({
  program: null,
  wallet: null,
  connected: false,
  publicKey: null,
});

export const useAnchorContext = () => React.useContext(AnchorContext);

// ── Inner Provider (needs useSolanaWallet) ────────────────────────────

const AnchorInner: FC<{ children: ReactNode }> = ({ children }) => {
  const solanaWallet = useSolanaWallet();

  const connection = useMemo(() => new Connection(ENDPOINT, "confirmed"), []);

  const anchorWallet: Wallet | null = useMemo(() => {
    if (!solanaWallet.wallet || !solanaWallet.publicKey || !solanaWallet.signTransaction) {
      return null;
    }

    return {
      publicKey: solanaWallet.publicKey,
      signTransaction: solanaWallet.signTransaction.bind(solanaWallet),
      signAllTransactions: solanaWallet.signAllTransactions
        ? solanaWallet.signAllTransactions.bind(solanaWallet)
        : async (txs: any[]) => txs,
    } as Wallet;
  }, [solanaWallet.wallet, solanaWallet.publicKey, solanaWallet.signTransaction]);

  const program: Program | null = useMemo(() => {
    if (!anchorWallet) return null;

    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
    });

    try {
      return new Program(
        IDL as Idl,
        provider
      );
    } catch {
      return null;
    }
  }, [connection, anchorWallet]);

  const value = useMemo(
    () => ({
      program,
      wallet: anchorWallet,
      connected: solanaWallet.connected,
      publicKey: solanaWallet.publicKey,
    }),
    [program, anchorWallet, solanaWallet.connected, solanaWallet.publicKey]
  );

  return (
    <AnchorContext.Provider value={value}>
      {children}
    </AnchorContext.Provider>
  );
};

// ── Top-level Provider ────────────────────────────────────────────────

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AnchorInner>{children}</AnchorInner>
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
