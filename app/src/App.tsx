import React, { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAnchorContext } from "./context/WalletProvider";
import { WalletContextProvider } from "./context/WalletProvider";
import { SineWaveBackground, WireframeBackground } from "./components/backgrounds";
import SettleBPage from "./pages/settle-b";
import MakerDashboard from "./pages/maker-dashboard";
import {
  Code2, Globe, ArrowRight, EyeOff, Link, Database, User,
  Shield, ArrowLeft, Activity, Hash, Cpu,
} from "lucide-react";

// ── Translations ──────────────────────────────────────────────────────

const translations = {
  zh: {
    nav: { app: "进入生产环境" },
    hero: {
      badge: "Production Ready v3.0",
      title: "零明文。零信任。100% 合规。",
      subtitle:
        "Solana 上首个基于加密余额池与极简承诺锚点的机构级 OTC 结算协议。交易意图绝密，彻底消除免费期权。",
      cta: "启动结算引擎",
      docs: "阅读实施文档",
    },
    features: {
      f1: {
        title: "池内结算零明文",
        desc: "全程无 SPL 转账。基于 Baby Jubjub ElGamal 加密，链上仅更新 128B 密文，结合 Groth16 ZK 保证守恒。",
      },
      f2: {
        title: "对称双向锁定 (Dual-Lock)",
        desc: "方案 B 核心：accept_commit 后双方余额强制同步锁定，彻底消除传统原子交换中的「观望免费期权」问题。",
      },
      f3: {
        title: "版本槽并发引擎",
        desc: "做市商专属：预留 VersionSlot PDA 打破 ZK 串行限制，支持并行生成多份证明，吞吐量提升 3.5 倍以上。",
      },
    },
  },
  en: {
    nav: { app: "Launch Production" },
    hero: {
      badge: "Production Ready v3.0",
      title: "Zero Text. Zero Trust. 100% Compliant.",
      subtitle:
        "The first institutional OTC settlement protocol on Solana powered by encrypted balances and minimalist commitment anchors.",
      cta: "Start Settlement Engine",
      docs: "Read Docs",
    },
    features: {
      f1: {
        title: "Zero-text Settlement",
        desc: "No SPL transfers. Uses Baby Jubjub ElGamal encryption to update 128B ciphertexts, guaranteed by Groth16 ZKs.",
      },
      f2: {
        title: "Symmetric Dual-Lock",
        desc: "Scheme B core: Both balances lock simultaneously upon accept, eliminating the 'free option' in atomic swaps.",
      },
      f3: {
        title: "Version Slot Concurrency",
        desc: "MM exclusive: Reserves VersionSlot PDAs to break ZK serialization, boosting throughput by over 3.5x.",
      },
    },
  },
};

// ── Feature Card ──────────────────────────────────────────────────────

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="group relative p-[1px] rounded-[2.5rem] overflow-hidden transition-transform duration-500 hover:-translate-y-2">
      <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative h-full bg-white/5 backdrop-blur-2xl p-8 rounded-[2.5rem] border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.2)] flex flex-col items-start overflow-hidden">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
        <div className="mb-6 p-4 rounded-2xl bg-white/5 border border-white/10 shadow-inner">
          {icon}
        </div>
        <h3 className="text-xl font-bold text-slate-100 mb-3">{title}</h3>
        <p className="text-slate-400 leading-relaxed text-sm">{desc}</p>
      </div>
    </div>
  );
}

// ── Home View ─────────────────────────────────────────────────────────

function HomeView({ onLaunch }: { onLaunch: () => void }) {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const t = translations[lang];

  return (
    <div className="relative z-10 flex flex-col min-h-screen text-slate-100 font-sans animate-fade-in">
      <header className="pt-6 px-4 md:px-8 flex justify-center">
        <div className="flex items-center justify-between w-full max-w-6xl px-6 py-3 bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] rounded-full">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-400 to-purple-500 flex items-center justify-center shadow-[0_0_15px_rgba(52,211,153,0.5)]">
              <Code2 size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-emerald-100 to-slate-300">
              Nexum Protocol
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              className="flex items-center space-x-1 text-sm text-slate-300 hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-white/10"
            >
              <Globe size={16} />
              <span>{lang === "zh" ? "EN" : "中文"}</span>
            </button>
            <button
              onClick={onLaunch}
              className="hidden sm:flex items-center space-x-2 bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-lg px-5 py-2 rounded-full transition-all hover:scale-105 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
            >
              <span className="text-sm font-medium">{t.nav.app}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center px-4 pt-20 pb-16 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium mb-8 backdrop-blur-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>{t.hero.badge}</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-tight text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 drop-shadow-lg">
          {t.hero.title.split("。").map((part, i, arr) => (
            <span key={i}>
              {part}
              {i !== arr.length - 1 ? "。" : ""}
              <br className="hidden md:block" />
            </span>
          ))}
        </h1>
        <p className="text-lg md:text-xl text-slate-400 mb-12 max-w-3xl leading-relaxed">
          {t.hero.subtitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6">
          <button
            onClick={onLaunch}
            className="group relative px-8 py-4 bg-emerald-500/20 text-emerald-300 font-bold rounded-full overflow-hidden backdrop-blur-xl border border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all hover:scale-105 hover:bg-emerald-500/30 hover:shadow-[0_0_60px_rgba(16,185,129,0.5)]"
          >
            <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 -translate-x-full group-hover:animate-[shine_1s_ease-in-out]" />
            <div className="relative flex items-center space-x-2">
              <span>{t.hero.cta}</span>
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
          <button className="px-8 py-4 rounded-full text-slate-300 hover:text-white transition-colors border border-transparent hover:border-white/10 hover:bg-white/5 backdrop-blur-sm">
            {t.hero.docs}
          </button>
        </div>
      </main>

      <section className="pb-24 px-4 max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6">
        <FeatureCard
          icon={<EyeOff className="text-purple-400" size={32} />}
          title={t.features.f1.title}
          desc={t.features.f1.desc}
        />
        <FeatureCard
          icon={<Link className="text-emerald-400" size={32} />}
          title={t.features.f2.title}
          desc={t.features.f2.desc}
        />
        <FeatureCard
          icon={<Database className="text-blue-400" size={32} />}
          title={t.features.f3.title}
          desc={t.features.f3.desc}
        />
      </section>
    </div>
  );
}

// ── Role Selection View ───────────────────────────────────────────────

function RoleSelectionView({
  onSelectTrader,
  onSelectRegulator,
  onBack,
}: {
  onSelectTrader: () => void;
  onSelectRegulator: () => void;
  onBack: () => void;
}) {
  return (
    <div className="relative z-10 flex flex-col min-h-screen items-center justify-center animate-fade-in font-mono text-slate-300">
      <button
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center space-x-2 text-slate-500 hover:text-slate-300 transition-colors bg-[#05080C] px-4 py-2 rounded-sm border border-slate-800"
      >
        <ArrowLeft size={16} />
        <span className="text-xs uppercase tracking-widest">Return to Home</span>
      </button>

      <div className="border border-slate-800 bg-[#05080C]/90 backdrop-blur-md p-10 md:p-12 max-w-4xl text-center rounded-sm shadow-[0_0_80px_rgba(20,241,149,0.05)] w-full">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center text-emerald-400 rounded-sm">
            <Activity size={32} />
          </div>
        </div>

        <div className="inline-block border border-emerald-900/50 bg-emerald-900/20 text-emerald-400 text-[10px] px-3 py-1 tracking-[0.2em] uppercase mb-8 rounded-sm">
          Production Environment (Scheme B)
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4 uppercase">
          System Initialization
        </h1>

        <div className="text-sm text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          Select your operational clearance to access the Nexum Network.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl mx-auto">
          <button
            onClick={onSelectTrader}
            className="group w-full px-4 py-8 bg-emerald-500/10 border border-emerald-500/40 hover:bg-emerald-500/20 text-emerald-400 font-bold uppercase tracking-widest text-[12px] transition-all flex flex-col items-center justify-center rounded-sm shadow-[0_0_20px_rgba(16,185,129,0.05)] hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]"
          >
            <User size={28} className="mb-4 group-hover:scale-110 transition-transform text-emerald-300" />
            <span className="text-emerald-300 mb-1">Institutional Trader</span>
            <span className="text-[10px] opacity-70 text-emerald-500 lowercase normal-case text-center mt-2">
              OTC Execution Node
              <br />
              (3-Step Dual-Lock)
            </span>
          </button>

          <button
            onClick={onSelectRegulator}
            className="group w-full px-4 py-8 bg-purple-900/20 border border-purple-500/30 hover:bg-purple-900/40 text-purple-300 font-bold uppercase tracking-widest text-[12px] transition-all flex flex-col items-center justify-center rounded-sm"
          >
            <Shield size={28} className="mb-4 group-hover:scale-110 transition-transform" />
            <span className="mb-1">Regulator Node</span>
            <span className="text-[10px] opacity-60 text-slate-400 lowercase normal-case text-center mt-2">
              Compliance Audit Gateway
              <br />
              (TEE Decryption)
            </span>
          </button>
        </div>
      </div>

      <div className="absolute bottom-8 flex space-x-12 text-[10px] text-slate-600 uppercase tracking-widest font-bold">
        <span className="flex items-center">
          <Hash size={12} className="mr-2 text-emerald-500/50" /> SHA-256 Commitments
        </span>
        <span className="flex items-center">
          <Link size={12} className="mr-2 text-blue-500/50" /> Symmetric Dual-Lock
        </span>
        <span className="flex items-center">
          <Cpu size={12} className="mr-2 text-purple-500/50" /> ZK Version Slots
        </span>
      </div>
    </div>
  );
}

// ── Wallet Gate (connect before production) ───────────────────────────

function WalletGate({ children }: { children: React.ReactNode }) {
  const { connected, program, publicKey } = useAnchorContext();
  const { setVisible } = useWalletModal();

  if (!connected || !publicKey) {
    return (
      <div className="relative z-10 flex flex-col min-h-screen items-center justify-center animate-fade-in font-mono text-slate-300">
        <WireframeBackground />
        <div className="border border-slate-800 bg-[#05080C]/90 backdrop-blur-md p-10 max-w-md text-center rounded-sm">
          <div className="w-16 h-16 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center text-emerald-400 rounded-sm mx-auto mb-6">
            <Code2 size={32} />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight uppercase mb-3">
            Authentication Required
          </h2>
          <p className="text-sm text-slate-400 mb-8">
            Connect your Solana wallet to access the production environment.
          </p>
          <button
            onClick={() => setVisible(true)}
            className="w-full py-3 px-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 font-bold uppercase tracking-widest text-xs rounded-sm hover:bg-emerald-500/30 transition-all"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="relative z-10 flex flex-col min-h-screen items-center justify-center font-mono text-amber-400">
        <WireframeBackground />
        <div className="border border-amber-500/30 bg-[#05080C]/90 p-8 rounded-sm text-center">
          <p>Wallet connected but program not loaded. Check your network.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ── App Shell ─────────────────────────────────────────────────────────

function AppInner() {
  const [view, setView] = useState<"home" | "roles" | "trader" | "regulator">("home");
  const { connected, publicKey } = useAnchorContext();
  const { setVisible } = useWalletModal();

  // Home + Role Selection: no wallet needed
  if (view === "home") {
    return (
      <div className="relative min-h-screen bg-[#08030c]">
        <SineWaveBackground />
        <HomeView onLaunch={() => setView("roles")} />
      </div>
    );
  }

  if (view === "roles") {
    return (
      <div className="relative min-h-screen bg-[#020408]">
        <WireframeBackground />
        <RoleSelectionView
          onSelectTrader={() => setView("trader")}
          onSelectRegulator={() => setView("regulator")}
          onBack={() => setView("home")}
        />
      </div>
    );
  }

  // Production views: need wallet
  if (view === "trader") {
    return (
      <div className="relative min-h-screen bg-[#020408]">
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

  // Regulator placeholder
  return (
    <div className="relative min-h-screen bg-[#020408]">
      <WireframeBackground />
      <div className="relative z-10 flex flex-col min-h-screen items-center justify-center animate-fade-in font-mono text-slate-300">
        <div className="border border-slate-800 bg-[#05080C]/90 backdrop-blur-md p-10 max-w-md text-center rounded-sm">
          <Shield size={48} className="text-purple-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white tracking-tight uppercase mb-3">
            Regulator Gateway
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            TEE Enclave Decryption is not yet available in this release.
          </p>
          <button
            onClick={() => setView("roles")}
            className="px-6 py-2 bg-slate-800 border border-slate-700 text-slate-300 text-xs uppercase tracking-widest rounded-sm hover:bg-slate-700 transition-colors"
          >
            Back to Roles
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WalletContextProvider>
      <AppInner />
    </WalletContextProvider>
  );
}
