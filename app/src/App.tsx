import { useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAnchorContext, WalletContextProvider } from "./context/WalletProvider";
import { I18nProvider, useI18n } from "./context/I18nProvider";
import { NexumSeal, Wordmark, Slot } from "./components/atoms";
import HomePage from "./pages/home";
import LoginPage from "./pages/login";
import TraderTerminal from "./pages/trader";
import RegulatorChamber from "./pages/regulator";
import MakerDashboard from "./pages/maker";

// ── Language context bridge ───────────────────────────────────────────
function LangBridge({ children }: { children: React.ReactNode }) {
  const { lang, setLang } = useI18n();
  // Adapt I18nProvider lang to the pages that expect { lang, setLang } props
  return <>{children}</>;
}

// ── Wallet Gate ───────────────────────────────────────────────────────
function WalletGate({ children }: { children: React.ReactNode }) {
  const { connected, program, publicKey } = useAnchorContext();
  const { setVisible } = useWalletModal();
  const { t } = useI18n();

  if (!connected || !publicKey) {
    return (
      <div className="dark" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ padding: '40px 48px', border: '1px solid var(--d-line-2)', background: 'var(--d-bg-2)', maxWidth: 420, textAlign: 'center' }}>
          <NexumSeal size={56} dark />
          <div className="serif" style={{ fontStyle: 'italic', fontSize: 28, color: '#f4f1ea', marginTop: 24, letterSpacing: '-.02em' }}>
            {t.wallet.title}
          </div>
          <div style={{ fontSize: 14, color: '#9a9aa3', marginTop: 8, lineHeight: 1.5 }}>
            {t.wallet.subtitle}
          </div>
          <button onClick={() => setVisible(true)} className="btn accent lg" style={{ width: '100%', justifyContent: 'center', marginTop: 28 }}>
            {t.wallet.connect}
          </button>
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="dark" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="mono" style={{ color: 'var(--accent)', letterSpacing: '.2em' }}>{t.wallet.loading}</div>
      </div>
    );
  }

  return <>{children}</>;
}

// ── Top-level route navigator ─────────────────────────────────────────
function AppRoutes() {
  const { lang, setLang } = useI18n();

  return (
    <Routes>
      <Route path="/" element={<HomePage lang={lang} setLang={setLang} />} />
      <Route path="/login" element={<LoginPage lang={lang} setLang={setLang} />} />
      <Route path="/trader" element={
        <WalletGate>
          <TraderTerminal lang={lang} setLang={setLang} />
        </WalletGate>
      } />
      <Route path="/regulator" element={
        <WalletGate>
          <RegulatorChamber lang={lang} setLang={setLang} />
        </WalletGate>
      } />
      <Route path="/maker" element={
        <WalletGate>
          <MakerDashboard lang={lang} setLang={setLang} />
        </WalletGate>
      } />
    </Routes>
  );
}

// ── Back-to-cover floating button ─────────────────────────────────────
function BackToCover() {
  const navigate = useNavigate();
  const location = useLocation();
  if (location.pathname === '/') return null;
  return (
    <div style={{ position: 'fixed', top: 14, right: 20, zIndex: 50, display: 'flex', gap: 6 }}>
      <button onClick={() => navigate('/')} className="mono" style={{ fontSize: 9, letterSpacing: '.18em', padding: '6px 10px', border: '1px solid var(--ink-3)', color: 'var(--ink-3)', background: 'rgba(244,241,234,.8)', backdropFilter: 'blur(6px)' }}>← COVER</button>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────
export default function App() {
  return (
    <I18nProvider>
      <WalletContextProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </WalletContextProvider>
    </I18nProvider>
  );
}
