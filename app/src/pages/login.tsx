// Login — identity selection between Trader and Regulator
// Converted from design_front/src/v3/login.jsx with TypeScript and react-router-dom navigation

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { NexumSeal, Wordmark, Slot } from "../components/atoms";

// ── Props ──────────────────────────────────────────────────────────────

interface LoginPageProps {
  lang: "zh" | "en";
  setLang: (lang: "zh" | "en") => void;
}

// ── RoleCard Props ─────────────────────────────────────────────────────

interface RoleCardProps {
  num: string;
  code: string;
  title: string;
  tagline: string;
  body: string;
  permissions: string[];
  denied: string[];
  accent: string;
  onClick: () => void;
  hover: boolean;
  onHover: () => void;
  onLeave: () => void;
}

// ── RoleCard ───────────────────────────────────────────────────────────

function RoleCard({
  num,
  code,
  title,
  tagline,
  body,
  permissions,
  denied,
  accent,
  onClick,
  hover,
  onHover,
  onLeave,
}: RoleCardProps) {
  // Stable signature seeded from the roman numeral (resolves once per mount)
  const [sig] = useState(() =>
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        textAlign: "left",
        padding: "32px 36px",
        border: `1px solid ${hover ? accent : "var(--ink)"}`,
        background: hover ? "var(--bg-2)" : "var(--bg)",
        transition: "all .25s",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        position: "relative",
        overflow: "hidden",
        minHeight: 540,
      }}
    >
      {/* top ribbon — code + roman numeral */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: ".22em",
            color: hover ? accent : "var(--ink-3)",
          }}
        >
          {code}
        </div>
        <div
          className="serif"
          style={{
            fontStyle: "italic",
            fontSize: 50,
            fontWeight: 300,
            color: hover ? accent : "var(--ink)",
            letterSpacing: "-.02em",
            lineHeight: 0.8,
          }}
        >
          {num}
        </div>
      </div>

      <div className="hr-ink" />

      {/* title + tagline */}
      <div>
        <h3
          className="serif"
          style={{
            margin: 0,
            fontSize: 54,
            fontWeight: 300,
            letterSpacing: "-.025em",
            lineHeight: 1,
            color: "var(--ink)",
          }}
        >
          {title}
        </h3>
        <div
          className="serif"
          style={{
            fontStyle: "italic",
            fontSize: 17,
            color: accent,
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          {tagline}
        </div>
      </div>

      {/* body */}
      <div
        style={{
          fontSize: 14,
          color: "var(--ink-2)",
          lineHeight: 1.6,
          textWrap: "pretty",
          maxWidth: 480,
        }}
      >
        {body}
      </div>

      {/* permissions / denied grid */}
      <div
        style={{
          marginTop: "auto",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
          paddingTop: 18,
          borderTop: "1px solid var(--line-2)",
        }}
      >
        <div>
          <div
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: ".2em",
              color: "var(--green)",
              marginBottom: 8,
            }}
          >
            ● ALLOWED
          </div>
          {permissions.map((p, i) => (
            <div
              key={i}
              className="mono"
              style={{
                fontSize: 10.5,
                color: "var(--ink-2)",
                padding: "3px 0",
                letterSpacing: ".04em",
              }}
            >
              · {p}
            </div>
          ))}
        </div>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: ".2em",
              color: "var(--danger)",
              marginBottom: 8,
            }}
          >
            ● DENIED
          </div>
          {denied.map((p, i) => (
            <div
              key={i}
              className="mono"
              style={{
                fontSize: 10.5,
                color: "var(--ink-faint)",
                padding: "3px 0",
                letterSpacing: ".04em",
                textDecoration: "line-through",
                textDecorationColor: "var(--danger)",
              }}
            >
              · {p}
            </div>
          ))}
        </div>
      </div>

      {/* enter + signature row */}
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 12,
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: ".2em",
            color: hover ? accent : "var(--ink)",
          }}
        >
          ENTER →
        </span>
        <span
          className="mono"
          style={{
            fontSize: 9,
            letterSpacing: ".18em",
            color: "var(--ink-faint)",
          }}
        >
          SIG-{num === "I" ? "7XKP" : "4VPM"}-{sig}
        </span>
      </div>

      {/* corner registration marks */}
      <span
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 10,
          height: 10,
          borderTop: "1px solid var(--ink)",
          borderRight: "1px solid var(--ink)",
          opacity: 0.6,
        }}
      />
      <span
        style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          width: 10,
          height: 10,
          borderBottom: "1px solid var(--ink)",
          borderLeft: "1px solid var(--ink)",
          opacity: 0.6,
        }}
      />
    </button>
  );
}

// ── LoginPage ──────────────────────────────────────────────────────────

function LoginPage({ lang, setLang }: LoginPageProps) {
  const t = <T,>(zh: T, en: T): T => (lang === "zh" ? zh : en);
  const navigate = useNavigate();
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── top rail ──────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "24px 48px",
          display: "flex",
          alignItems: "center",
          gap: 24,
          borderBottom: "1px solid var(--ink)",
        }}
      >
        <NexumSeal size={32} />
        <Wordmark />
        <div style={{ flex: 1 }} />
        <span
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: ".22em",
            color: "var(--ink-3)",
          }}
        >
          SCHEME B · v3.0
        </span>
        <span
          style={{ width: 1, height: 14, background: "var(--line-2)" }}
        />
        <Slot />
        <span
          style={{ width: 1, height: 14, background: "var(--line-2)" }}
        />
        <button
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          className="mono"
          style={{ fontSize: 11, letterSpacing: ".15em" }}
        >
          {lang === "zh" ? "EN" : "中"}
        </button>
      </div>

      {/* ── main content (centered) ───────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "40px 48px",
          maxWidth: 1500,
          margin: "0 auto",
          width: "100%",
        }}
      >
        {/* heading block */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            gap: 32,
            marginBottom: 48,
            alignItems: "end",
          }}
        >
          <div
            className="serif"
            style={{
              fontSize: 88,
              fontWeight: 300,
              lineHeight: 0.85,
              letterSpacing: "-.04em",
            }}
          >
            00
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 14 }}>
              FOLIO 00 · CREDENTIAL GATE
            </div>
            <h1
              className="serif"
              style={{
                margin: 0,
                fontSize: "clamp(48px, 5.2vw, 84px)",
                fontWeight: 300,
                letterSpacing: "-.03em",
                lineHeight: 0.95,
              }}
            >
              {t(
                <>
                  选择身份。
                  <br />
                  <em style={{ fontStyle: "italic" }}>
                    每一种身份只看见它该看见的。
                  </em>
                </>,
                <>
                  Choose your role.
                  <br />
                  <em style={{ fontStyle: "italic" }}>
                    Each sees only what its station permits.
                  </em>
                </>
              )}
            </h1>
          </div>
        </div>

        {/* ── the two role cards ──────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
          }}
        >
          {/* Trader card */}
          <RoleCard
            num="I"
            code="TRADER · DESK"
            title={t("交易员", "Trader")}
            tagline={t(
              "发起意向 · 双向锁定 · 双证执行",
              "Initiate · Lock symmetrically · Execute with dual proof"
            )}
            body={t(
              "你将进入结算终端。在这里你协商对手方、计算承诺哈希、提交链上意图，并在 30 秒执行窗口内见证两份 Groth16 证明同时落定。",
              "You enter the settlement terminal. Here you negotiate counterparties, compute commitment hashes, submit on-chain intent, and watch two Groth16 proofs land within a 30-second execute window."
            )}
            permissions={[
              t("生成 / 提交 ZK 证明", "Generate & submit ZK proofs"),
              t("查看自己的余额密文", "Read own ciphertext balance"),
              "initiate / accept / execute",
            ]}
            denied={[
              t("查看其它账本明文", "See plaintext of other ledgers"),
              t("解密历史结算", "Decrypt historical settlements"),
            ]}
            accent="var(--accent)"
            onClick={() => navigate("/trader")}
            hover={hover === "trader"}
            onHover={() => setHover("trader")}
            onLeave={() => setHover(null)}
          />

          {/* Regulator card */}
          <RoleCard
            num="II"
            code="AUDITOR · CHAMBERS"
            title={t("监察机构", "Regulator")}
            tagline={t(
              "凭审计密钥 · 还原历史结算 · 不留痕迹的留痕",
              "By audit key · reconstruct settlements · auditing leaves audit trail"
            )}
            body={t(
              "你将进入审计室。给定一笔结算的 Tx ID 与协议托管的审计密钥，你可以在不重置链上状态的前提下解密涉及双方、金额、时间。每一次解密都被强制写入审计日志。",
              "You enter the audit chamber. Given a settlement Tx ID and the protocol-escrowed audit key, you may decrypt the parties, amount and time without disturbing chain state. Every decryption is forcibly written to the audit log."
            )}
            permissions={[
              t("解密 audit_ct 字段", "Decrypt audit_ct fields"),
              t("查询任意 Settlement Record", "Query any Settlement Record"),
              t("导出取证报告 (PDF/JSON)", "Export forensic reports (PDF/JSON)"),
            ]}
            denied={[
              t("修改任何账本状态", "Mutate any ledger state"),
              t("提交交易", "Submit transactions"),
            ]}
            accent="var(--indigo)"
            onClick={() => navigate("/regulator")}
            hover={hover === "regulator"}
            onHover={() => setHover("regulator")}
            onLeave={() => setHover(null)}
          />
        </div>

        {/* ── footer note ─────────────────────────────────────────────── */}
        <div
          style={{
            marginTop: 32,
            paddingTop: 18,
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: ".18em",
              color: "var(--ink-3)",
            }}
          >
            {t(
              "· 此为演示环境，不接入真实钱包 ·",
              "· demo environment, no wallet connection ·"
            )}
          </span>
          <button
            onClick={() => navigate("/")}
            className="mono"
            style={{
              fontSize: 10,
              letterSpacing: ".18em",
              color: "var(--ink-3)",
              textDecoration: "underline",
            }}
          >
            ← {t("返回封面", "BACK TO COVER")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
