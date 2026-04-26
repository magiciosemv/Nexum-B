import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAnchorContext, WalletContextProvider } from "./context/WalletProvider";
import { I18nProvider, useI18n } from "./context/I18nProvider";
import { SineWaveBackground, WireframeBackground } from "./components/backgrounds";
import SettleBPage from "./pages/settle-b";
import MakerDashboard from "./pages/maker-dashboard";
import RegulatorPage from "./pages/regulator";
import {
  Code2, Globe, ArrowRight, EyeOff, Link, Database, User,
  Shield, ArrowLeft, Activity, Hash, Cpu, Wallet,
} from "lucide-react";

// ── Feature Card ──────────────────────────────────────────────────────

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="group relative p-[1px] rounded-2xl overflow-hidden transition-transform duration-500 hover:-translate-y-1">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-400/20 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative h-full bg-white/[0.03] backdrop-blur-xl p-8 rounded-2xl border border-white/[0.06] flex flex-col items-start">
        <div className="mb-5 p-3 rounded-xl bg-amber-400/5 border border-amber-400/10">{icon}</div>
        <h3 className="text-base font-display font-bold text-slate-100 mb-2 tracking-wide">{title}</h3>
        <p className="text-slate-400 leading-relaxed text-sm">{desc}</p>
      </div>
    </div>
  );
}

// ── Home View ─────────────────────────────────────────────────────────

function HomeView({ onLaunch }: { onLaunch: () => void }) {
  const { t, lang, setLang } = useI18n();

  return (
    <div className="relative z-10 flex flex-col min-h-screen text-slate-100 font-sans animate-fade-in">
      <header className="pt-6 px-4 md:px-8 flex justify-center">
        <div className="flex items-center justify-between w-full max-w-6xl px-6 py-3 bg-white/[0.04] backdrop-blur-lg border border-white/[0.08] rounded-full">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Code2 size={18} className="text-black" />
            </div>
            <span className="text-lg font-display font-bold tracking-widest text-amber-50">NEXUM</span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              className="flex items-center space-x-1 text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-white/[0.06] cursor-pointer"
            >
              <Globe size={14} />
              <span>{t.home.langToggle}</span>
            </button>
            <button
              onClick={onLaunch}
              className="hidden sm:flex items-center space-x-2 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 px-5 py-2 rounded-full transition-all hover:scale-105 cursor-pointer"
            >
              <span className="text-sm font-medium text-amber-300">{t.home.launchProd}</span>
              <ArrowRight size={14} className="text-amber-400" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center px-4 pt-16 pb-12 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 text-sm font-mono mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <span>{t.home.badge}</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-display font-black tracking-tight mb-6 leading-tight text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-white to-slate-400">
          {t.home.title}
        </h1>
        <p className="text-base md:text-lg text-slate-400 mb-10 max-w-3xl leading-relaxed">{t.home.subtitle}</p>
        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-5">
          <button
            onClick={onLaunch}
            className="group relative px-8 py-4 bg-amber-400/15 text-amber-300 font-display font-bold rounded-full overflow-hidden border border-amber-400/40 shadow-[0_0_30px_rgba(245,158,11,0.2)] transition-all hover:scale-105 hover:bg-amber-400/25 cursor-pointer animate-pulse-glow"
          >
            <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12 -translate-x-full group-hover:animate-[shine_1s_ease-in-out]" />
            <div className="relative flex items-center space-x-2 text-sm tracking-wider">
              <span>{t.home.cta}</span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
          <button className="px-6 py-3 rounded-full text-slate-400 hover:text-white transition-colors border border-transparent hover:border-white/[0.06] hover:bg-white/[0.03] cursor-pointer text-sm">
            {t.home.docs}
          </button>
        </div>
      </main>

      <section className="pb-20 px-4 max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-5">
        <FeatureCard icon={<EyeOff className="text-purple-400" size={28} />} title={t.home.f1Title} desc={t.home.f1Desc} />
        <FeatureCard icon={<Link className="text-amber-400" size={28} />} title={t.home.f2Title} desc={t.home.f2Desc} />
        <FeatureCard icon={<Database className="text-blue-400" size={28} />} title={t.home.f3Title} desc={t.home.f3Desc} />
      </section>
    </div>
  );
}

// ── Role Selection ────────────────────────────────────────────────────

function RoleSelectionView({
  onSelectTrader,
  onSelectRegulator,
  onBack,
}: {
  onSelectTrader: () => void;
  onSelectRegulator: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="relative z-10 flex flex-col min-h-screen items-center justify-center animate-fade-in font-mono text-slate-300">
      <button
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center space-x-2 text-slate-500 hover:text-slate-300 transition-colors bg-slate-900/80 px-4 py-2 rounded-lg border border-slate-700/50 cursor-pointer"
      >
        <ArrowLeft size={14} />
        <span className="text-[10px] uppercase tracking-widest">{t.roles.back}</span>
      </button>

      <div className="border border-slate-700/50 bg-slate-900/80 backdrop-blur-lg p-10 md:p-12 max-w-3xl text-center rounded-xl w-full">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 border border-amber-400/30 bg-amber-400/10 flex items-center justify-center text-amber-400 rounded-xl">
            <Activity size={28} />
          </div>
        </div>
        <div className="inline-block border border-amber-900/40 bg-amber-900/20 text-amber-400 text-[10px] px-3 py-1 tracking-[0.15em] uppercase mb-6 rounded-md font-mono">
          {t.roles.badge}
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-black text-white tracking-tight mb-3 uppercase">
          {t.roles.title}
        </h1>
        <p className="text-sm text-slate-400 mb-8 max-w-lg mx-auto leading-relaxed">{t.roles.subtitle}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-xl mx-auto">
          <button
            onClick={onSelectTrader}
            className="group w-full px-4 py-7 bg-amber-400/[0.07] border border-amber-400/30 hover:bg-amber-400/[0.14] text-amber-300 font-bold uppercase tracking-widest text-[11px] transition-all flex flex-col items-center justify-center rounded-xl cursor-pointer"
          >
            <User size={24} className="mb-3 group-hover:scale-110 transition-transform text-amber-400" />
            <span className="text-amber-300 mb-1">{t.roles.traderBtn}</span>
            <span className="text-[10px] opacity-60 text-amber-500 normal-case text-center mt-1">{t.roles.traderSub}</span>
          </button>
          <button
            onClick={onSelectRegulator}
            className="group w-full px-4 py-7 bg-purple-500/[0.06] border border-purple-400/25 hover:bg-purple-500/[0.12] text-purple-300 font-bold uppercase tracking-widest text-[11px] transition-all flex flex-col items-center justify-center rounded-xl cursor-pointer"
          >
            <Shield size={24} className="mb-3 group-hover:scale-110 transition-transform" />
            <span className="mb-1">{t.roles.regulatorBtn}</span>
            <span className="text-[10px] opacity-50 text-slate-400 normal-case text-center mt-1">{t.roles.regulatorSub}</span>
          </button>
        </div>
      </div>

      <div className="absolute bottom-8 flex space-x-10 text-[10px] text-slate-600 uppercase tracking-widest font-bold">
        <span className="flex items-center"><Hash size={11} className="mr-2 text-amber-500/40" />{t.roles.footerHash}</span>
        <span className="flex items-center"><Link size={11} className="mr-2 text-blue-400/40" />{t.roles.footerLock}</span>
        <span className="flex items-center"><Cpu size={11} className="mr-2 text-purple-400/40" />{t.roles.footerSlots}</span>
      </div>
    </div>
  );
}

// ── Wallet Gate ───────────────────────────────────────────────────────

function WalletGate({ children }: { children: React.ReactNode }) {
  const { connected, program, publicKey } = useAnchorContext();
  const { setVisible } = useWalletModal();
  const { t } = useI18n();

  if (!connected || !publicKey) {
    return (
      <div className="relative z-10 flex flex-col min-h-screen items-center justify-center animate-fade-in font-mono text-slate-300">
        <WireframeBackground />
        <div className="border border-slate-700/50 bg-slate-900/90 backdrop-blur-lg p-10 max-w-md text-center rounded-xl">
          <div className="w-14 h-14 border border-amber-400/30 bg-amber-400/10 flex items-center justify-center text-amber-400 rounded-xl mx-auto mb-5">
            <Wallet size={28} />
          </div>
          <h2 className="text-xl font-display font-bold text-white tracking-tight uppercase mb-2">{t.wallet.title}</h2>
          <p className="text-sm text-slate-400 mb-6">{t.wallet.subtitle}</p>
          <button
            onClick={() => setVisible(true)}
            className="w-full py-3 bg-amber-400/15 border border-amber-400/40 text-amber-400 font-display font-bold uppercase tracking-widest text-xs rounded-lg hover:bg-amber-400/25 transition-all cursor-pointer"
          >
            {t.wallet.connect}
          </button>
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="relative z-10 flex flex-col min-h-screen items-center justify-center font-mono text-amber-400">
        <WireframeBackground />
        <p>{t.wallet.loading}</p>
      </div>
    );
  }

  return <>{children}</>;
}

// ── App Shell ─────────────────────────────────────────────────────────

function AppInner() {
  const [view, setView] = useState<"home" | "roles" | "trader" | "regulator">("home");
  const { t } = useI18n();

  if (view === "home") {
    return (
      <div className="relative min-h-screen bg-[#0a0e1a]">
        <SineWaveBackground />
        <HomeView onLaunch={() => setView("roles")} />
      </div>
    );
  }

  if (view === "roles") {
    return (
      <div className="relative min-h-screen bg-[#0F172A]">
        <WireframeBackground />
        <RoleSelectionView
          onSelectTrader={() => setView("trader")}
          onSelectRegulator={() => setView("regulator")}
          onBack={() => setView("home")}
        />
      </div>
    );
  }

  if (view === "trader") {
    return (
      <div className="relative min-h-screen bg-[#0F172A]">
        <WireframeBackground />
        <WalletGate>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<SettleBPage onBack={() => setView("roles")} />} />
              <Route path="/maker" element={<MakerDashboard onBack={() => setView("roles")} />} />
            </Routes>
          </BrowserRouter>
        </WalletGate>
      </div>
    );
  }

  // Regulator view
  return (
    <div className="relative min-h-screen bg-[#0F172A]">
      <WireframeBackground />
      <RegulatorPage onBack={() => setView("roles")} />
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <WalletContextProvider>
        <AppInner />
      </WalletContextProvider>
    </I18nProvider>
  );
}
