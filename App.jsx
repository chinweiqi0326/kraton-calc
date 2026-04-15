import { useState, useMemo } from "react";

const DEPOSIT_TIERS = [
  { limit: 20_000_000, rate: 0.005 },
  { limit: 40_000_000, rate: 0.004 },
  { limit: 60_000_000, rate: 0.003 },
  { limit: 80_000_000, rate: 0.002 },
];

const WITHDRAWAL_TIERS = [
  { limit: 20_000_000, rate: 0.001 },
  { limit: 40_000_000, rate: 0.00075 },
  { limit: 60_000_000, rate: 0.0005 },
  { limit: 80_000_000, rate: 0.0005 },
];

function calcTieredProfit(amount, tiers) {
  let remaining = amount;
  let profit = 0;
  let prev = 0;
  const breakdown = [];
  for (const tier of tiers) {
    const sliceMax = tier.limit - prev;
    const slice = Math.min(remaining, sliceMax);
    if (slice <= 0) break;
    const p = slice * tier.rate;
    profit += p;
    breakdown.push({ from: prev, to: prev + slice, rate: tier.rate, profit: p });
    remaining -= slice;
    prev = tier.limit;
  }
  if (remaining > 0) {
    const lastRate = tiers[tiers.length - 1].rate;
    const p = remaining * lastRate;
    profit += p;
    breakdown.push({ from: prev, to: prev + remaining, rate: lastRate, profit: p });
  }
  return { profit, breakdown };
}

function fmt(n) {
  return "฿" + Math.round(n).toLocaleString("en-US");
}

function fmtM(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

function NumberInput({ label, value, onChange, placeholder = "0", color = "#4fc3f7", sublabel = "" }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#8888aa" }}>{label}</span>
        {sublabel && <span style={{ fontSize: 10, color: "#555" }}>{sublabel}</span>}
      </div>
      <div style={{
        display: "flex", alignItems: "center",
        background: "#0d0d14", borderRadius: 8, border: "1px solid #2a2a3a", overflow: "hidden",
      }}>
        <span style={{ padding: "10px 0 10px 12px", fontSize: 14, color: "#555" }}>฿</span>
        <input
          type="text" inputMode="numeric" placeholder={placeholder} value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color, fontSize: 18, fontWeight: 700, fontFamily: "'Courier New', monospace", padding: "10px 8px",
          }}
        />
      </div>
    </div>
  );
}

// DAXIX payout schedule: month 1-3: nominee 8K + agent 5K = 13K, month 4-6: agent 5K
function getDaxixPayout(month) {
  if (month <= 3) return 13000;
  if (month <= 6) return 5000;
  return 0;
}

function getDaxixRemainingPayout(blowMonth) {
  let total = 0;
  for (let m = blowMonth + 1; m <= 6; m++) {
    total += getDaxixPayout(m);
  }
  return total;
}

export default function ProfitCalculator() {
  const [depositStr, setDepositStr] = useState("30000000");
  const [withdrawalStr, setWithdrawalStr] = useState("20000000");
  const [runnerFeeStr, setRunnerFeeStr] = useState("20000");
  const [agentMonthlyStr, setAgentMonthlyStr] = useState("20000");
  const [oldPlanTotalStr, setOldPlanTotalStr] = useState("57000");
  const [contractMonths] = useState(5);
  const [cardMerchantPct] = useState(75);

  const depositAmt = Number(depositStr) || 0;
  const withdrawalAmt = Number(withdrawalStr) || 0;
  const runnerFee = Number(runnerFeeStr) || 0;
  const agentMonthly = Number(agentMonthlyStr) || 0;
  const oldPlanTotal = Number(oldPlanTotalStr) || 0;

  const results = useMemo(() => {
    const deposit = calcTieredProfit(depositAmt, DEPOSIT_TIERS);
    const withdrawal = calcTieredProfit(withdrawalAmt, WITHDRAWAL_TIERS);
    const totalProfit = deposit.profit + withdrawal.profit;

    // Monthly Chester share calculation
    // Month 1: (profit - runner - agent) / 2 / 2 = share, + agent passes through hand
    // Month 2+: (profit - agent) / 2 / 2 = share, + agent passes through hand
    const month1Deduct = runnerFee + agentMonthly;
    const month2Deduct = agentMonthly;

    const month1Share = Math.max(0, totalProfit - month1Deduct) / 4;
    const month2Share = Math.max(0, totalProfit - month2Deduct) / 4;

    // What passes through Chester's hand each month (share + agent)
    const month1InHand = month1Share + agentMonthly;
    const month2InHand = month2Share + agentMonthly;

    // After DAXIX payout
    const month1Net = month1InHand - getDaxixPayout(1); // 50K - 13K = 37K
    const month2Net = month2InHand - getDaxixPayout(2); // 55K - 13K = 42K
    const month3Net = month2InHand - getDaxixPayout(3); // 55K - 13K = 42K
    const month4Net = month2InHand - getDaxixPayout(4); // 55K - 5K = 50K
    const month5Net = month2InHand - getDaxixPayout(5); // 55K - 5K = 50K

    const monthlyNets = [month1Net, month2Net, month3Net, month4Net, month5Net];

    // Cumulative earnings at end of each month
    const cumulative = [];
    let sum = 0;
    for (let i = 0; i < contractMonths; i++) {
      sum += monthlyNets[i];
      cumulative.push(sum);
    }

    // Blow-up analysis for each month
    const blowAnalysis = [];
    for (let blowAt = 1; blowAt <= contractMonths; blowAt++) {
      const earned = cumulative[blowAt - 1];
      const remainingMonths = contractMonths - blowAt;
      const daxixRemaining = getDaxixRemainingPayout(blowAt);
      const cardMerchantPays = (agentMonthly * cardMerchantPct / 100) * remainingMonths;
      const coverDaxix = Math.min(cardMerchantPays, daxixRemaining);
      const leftover = cardMerchantPays - coverDaxix;
      const totalBeforeCom = earned + leftover;
      const chesterFinal = totalBeforeCom / 2; // DAXIX COM split

      blowAnalysis.push({
        month: blowAt,
        earned,
        remainingMonths,
        daxixRemaining,
        cardMerchantPays,
        leftover,
        totalBeforeCom,
        chesterFinal,
        vsOldPlan: chesterFinal - oldPlanTotal,
        isWin: chesterFinal >= oldPlanTotal,
      });
    }

    // Full run (no blow)
    const fullRunTotal = cumulative[contractMonths - 1];
    // Month 6: no profit, just pay DAXIX agent 5K
    const month6Payout = getDaxixPayout(6);
    const fullRunBeforeCom = fullRunTotal - month6Payout;
    const fullRunChester = fullRunBeforeCom / 2;

    return {
      deposit, withdrawal, totalProfit,
      month1Share, month2Share, month1InHand, month2InHand,
      month1Net, month2Net, month3Net, month4Net, month5Net,
      monthlyNets, cumulative, blowAnalysis,
      fullRunTotal: fullRunBeforeCom, fullRunChester,
      totalVolume: depositAmt + withdrawalAmt,
    };
  }, [depositAmt, withdrawalAmt, runnerFee, agentMonthly, oldPlanTotal, contractMonths, cardMerchantPct]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0a0a0f 0%, #12121f 40%, #0d1117 100%)",
      color: "#e8e6e3",
      fontFamily: "'Courier New', monospace",
      padding: "16px",
    }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>

        {/* Header */}
        <div style={{
          textAlign: "center", marginBottom: 28,
          padding: "20px 0 16px", borderBottom: "1px solid #2a2a3a",
        }}>
          <div style={{ fontSize: 10, letterSpacing: 4, color: "#6b6b8a", textTransform: "uppercase", marginBottom: 6 }}>Chester's</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f0f0f0", margin: 0, letterSpacing: 1 }}>利润计算器 v4</h1>
          <div style={{ fontSize: 10, color: "#4a4a6a", marginTop: 4 }}>完整版 · 含爆户风险分析</div>
        </div>

        {/* INPUT: Volume */}
        <div style={{ background: "#16161f", borderRadius: 12, padding: "18px", marginBottom: 14, border: "1px solid #22222f" }}>
          <div style={{ fontSize: 11, color: "#6b6b8a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>① 流水 Volume</div>
          <NumberInput label="入款 Deposit" value={depositStr} onChange={setDepositStr} color="#66bb6a" sublabel={fmtM(depositAmt)} />
          <NumberInput label="出款 Withdrawal" value={withdrawalStr} onChange={setWithdrawalStr} color="#ef5350" sublabel={fmtM(withdrawalAmt)} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#4fc3f7", padding: "8px 0 0", borderTop: "1px solid #1e1e2e" }}>
            <span>总流水</span><span style={{ fontWeight: 700 }}>{fmtM(results.totalVolume)}</span>
          </div>
        </div>

        {/* INPUT: Deductions */}
        <div style={{ background: "#16161f", borderRadius: 12, padding: "18px", marginBottom: 14, border: "1px solid #22222f" }}>
          <div style={{ fontSize: 11, color: "#6b6b8a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>② 扣除 Deductions</div>
          <NumberInput label="跑腿费 Runner Fee（仅第1月）" value={runnerFeeStr} onChange={setRunnerFeeStr} color="#ffa726" />
          <NumberInput label="Agent 每月保障" value={agentMonthlyStr} onChange={setAgentMonthlyStr} color="#ffa726" />
        </div>

        {/* INPUT: Old Plan */}
        <div style={{ background: "#16161f", borderRadius: 12, padding: "18px", marginBottom: 14, border: "1px solid #22222f" }}>
          <div style={{ fontSize: 11, color: "#6b6b8a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>③ 旧Plan（6个月总到手）</div>
          <NumberInput label="旧Plan Chester 净赚" value={oldPlanTotalStr} onChange={setOldPlanTotalStr} color="#ffa726" sublabel="扣完payout + COM后" />
        </div>

        {/* Profit Breakdown */}
        <div style={{ background: "#16161f", borderRadius: 12, padding: "18px", marginBottom: 14, border: "1px solid #22222f" }}>
          <div style={{ fontSize: 11, color: "#6b6b8a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>利润分解 Breakdown</div>

          {results.deposit.breakdown.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#66bb6a", marginBottom: 6 }}>▸ Deposit</div>
              {results.deposit.breakdown.map((b, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", padding: "2px 0 2px 12px" }}>
                  <span>{fmtM(b.from)}–{fmtM(b.to)} @ {(b.rate * 100).toFixed(2)}%</span>
                  <span style={{ color: "#999" }}>{fmt(b.profit)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#66bb6a", padding: "4px 0 0 12px", borderTop: "1px solid #1e1e2e", marginTop: 4 }}>
                <span>Subtotal</span><span>{fmt(results.deposit.profit)}</span>
              </div>
            </div>
          )}

          {results.withdrawal.breakdown.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#ef5350", marginBottom: 6 }}>▸ Withdrawal</div>
              {results.withdrawal.breakdown.map((b, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", padding: "2px 0 2px 12px" }}>
                  <span>{fmtM(b.from)}–{fmtM(b.to)} @ {(b.rate * 100).toFixed(3)}%</span>
                  <span style={{ color: "#999" }}>{fmt(b.profit)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#ef5350", padding: "4px 0 0 12px", borderTop: "1px solid #1e1e2e", marginTop: 4 }}>
                <span>Subtotal</span><span>{fmt(results.withdrawal.profit)}</span>
              </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#f0f0f0", padding: "10px 0 0", borderTop: "1px solid #2a2a3a" }}>
            <span>总利润/月</span><span style={{ color: "#4fc3f7" }}>{fmt(results.totalProfit)}</span>
          </div>
        </div>

        {/* Monthly Distribution */}
        <div style={{ background: "#16161f", borderRadius: 12, padding: "18px", marginBottom: 14, border: "1px solid #22222f" }}>
          <div style={{ fontSize: 11, color: "#6b6b8a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>每月到手 Monthly Breakdown</div>

          {[1, 2, 3, 4, 5].map((m) => {
            const isM1 = m === 1;
            const deduct = isM1 ? (runnerFee + agentMonthly) : agentMonthly;
            const share = Math.max(0, results.totalProfit - deduct) / 4;
            const inHand = share + agentMonthly;
            const daxixPay = getDaxixPayout(m);
            const net = inHand - daxixPay;
            return (
              <div key={m} style={{
                padding: "10px 0",
                borderBottom: m < 5 ? "1px solid #1e1e2e" : "none",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: "#888" }}>月{m}</span>
                  <span style={{ color: "#4fc3f7", fontWeight: 700 }}>{fmt(net)}</span>
                </div>
                <div style={{ fontSize: 10, color: "#555", paddingLeft: 8 }}>
                  份额 {fmt(share)} + Agent {fmt(agentMonthly)} = {fmt(inHand)} − DAXIX {fmt(daxixPay)}
                  {isM1 && <span style={{ color: "#ffa726" }}> (含跑腿费)</span>}
                </div>
              </div>
            );
          })}

          <div style={{ padding: "10px 0", borderTop: "1px solid #2a2a3a", marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888" }}>
              <span>月6（空窗期）</span>
              <span style={{ color: "#ef5350" }}>-{fmt(getDaxixPayout(6))}</span>
            </div>
            <div style={{ fontSize: 10, color: "#555", paddingLeft: 8 }}>无利润，仍需付 DAXIX 代理</div>
          </div>

          <div style={{
            marginTop: 12, padding: "14px 16px", borderRadius: 8,
            background: "linear-gradient(135deg, #1b3a2a, #1a2f2a)", border: "1px solid #2d5a3d",
          }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>跑满5个月 + 月6空窗 → ÷2 DAXIX COM</div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>({fmt(results.fullRunTotal)}) ÷ 2</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#66bb6a" }}>{fmt(results.fullRunChester)}</div>
          </div>
        </div>

        {/* BLOW-UP RISK ANALYSIS */}
        <div style={{ background: "#16161f", borderRadius: 12, padding: "18px", marginBottom: 14, border: "1px solid #22222f" }}>
          <div style={{ fontSize: 11, color: "#6b6b8a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>爆户风险分析</div>
          <div style={{ fontSize: 10, color: "#444", marginBottom: 14 }}>卡商赔75% cover DAXIX payout → 剩余+利润 ÷2 COM</div>

          {/* Table header */}
          <div style={{ display: "flex", padding: "8px 0", borderBottom: "1px solid #2a2a3a", fontSize: 11, color: "#888" }}>
            <div style={{ width: "22%", fontWeight: 600 }}>爆在</div>
            <div style={{ width: "33%", fontWeight: 600, textAlign: "right" }}>净赚</div>
            <div style={{ width: "45%", fontWeight: 600, textAlign: "right" }}>vs 旧Plan</div>
          </div>

          {/* Table rows */}
          {results.blowAnalysis.map((row) => (
            <div key={row.month} style={{
              display: "flex", padding: "10px 0",
              borderBottom: "1px solid #1a1a24",
              alignItems: "center",
            }}>
              <div style={{ width: "22%", fontSize: 13, color: "#aaa" }}>月{row.month}</div>
              <div style={{ width: "33%", textAlign: "right", fontSize: 14, fontWeight: 700, color: row.isWin ? "#66bb6a" : "#ef5350" }}>
                {fmt(row.chesterFinal)}
              </div>
              <div style={{ width: "45%", textAlign: "right", fontSize: 13 }}>
                <span style={{ marginRight: 6 }}>{row.isWin ? "✅" : "❌"}</span>
                <span style={{ color: row.isWin ? "#66bb6a" : "#ef5350" }}>
                  {row.isWin ? "赢" : "输"} {fmt(Math.abs(row.vsOldPlan))}
                </span>
              </div>
            </div>
          ))}

          {/* Full run row */}
          <div style={{
            display: "flex", padding: "10px 0",
            borderTop: "1px solid #2a2a3a",
            alignItems: "center",
          }}>
            <div style={{ width: "22%", fontSize: 13, color: "#4fc3f7", fontWeight: 600 }}>跑满</div>
            <div style={{ width: "33%", textAlign: "right", fontSize: 14, fontWeight: 700, color: "#66bb6a" }}>
              {fmt(results.fullRunChester)}
            </div>
            <div style={{ width: "45%", textAlign: "right", fontSize: 13 }}>
              <span style={{ marginRight: 6 }}>✅</span>
              <span style={{ color: "#66bb6a" }}>赢 {fmt(results.fullRunChester - oldPlanTotal)}</span>
            </div>
          </div>

          {/* Find break even month */}
          {(() => {
            const beMonth = results.blowAnalysis.find(r => r.isWin);
            return beMonth ? (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 8,
                background: "linear-gradient(135deg, #1a2a3a, #162030)",
                border: "1px solid #2a3a5a",
                textAlign: "center",
              }}>
                <span style={{ fontSize: 12, color: "#4fc3f7" }}>
                  结论：跑满{beMonth.month}个月就赢旧 Plan！
                </span>
              </div>
            ) : (
              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 8,
                background: "linear-gradient(135deg, #3a1a1a, #301616)",
                border: "1px solid #5a2a2a",
                textAlign: "center",
              }}>
                <span style={{ fontSize: 12, color: "#ef5350" }}>
                  ⚠️ 需要跑满整个合约才能赢旧Plan
                </span>
              </div>
            );
          })()}
        </div>

        {/* Blow detail expand */}
        {results.blowAnalysis.map((row) => (
          <details key={row.month} style={{ marginBottom: 8 }}>
            <summary style={{
              background: "#16161f", borderRadius: 8, padding: "10px 14px",
              border: "1px solid #22222f", cursor: "pointer",
              fontSize: 12, color: "#888", listStyle: "none",
              display: "flex", justifyContent: "space-between",
            }}>
              <span>📊 月{row.month}爆 详细算法</span>
              <span style={{ color: "#555" }}>展开 ▾</span>
            </summary>
            <div style={{
              background: "#12121a", borderRadius: "0 0 8px 8px",
              padding: "12px 14px", border: "1px solid #1e1e2e", borderTop: "none",
              fontSize: 11, color: "#666",
            }}>
              <div style={{ marginBottom: 4 }}>累计利润：{fmt(row.earned)}</div>
              <div style={{ marginBottom: 4 }}>DAXIX 剩余 payout：{fmt(row.daxixRemaining)}</div>
              <div style={{ marginBottom: 4 }}>卡商赔 agent：{fmt(agentMonthly * cardMerchantPct / 100)}/月 × {row.remainingMonths}个月 = {fmt(row.cardMerchantPays)}</div>
              <div style={{ marginBottom: 4 }}>Cover DAXIX：{fmt(row.cardMerchantPays)} − {fmt(row.daxixRemaining)} = {fmt(row.leftover)}</div>
              <div style={{ marginBottom: 4 }}>小计：{fmt(row.earned)} + {fmt(row.leftover)} = {fmt(row.totalBeforeCom)}</div>
              <div style={{ color: "#4fc3f7", fontWeight: 600 }}>÷2 DAXIX COM = {fmt(row.chesterFinal)}</div>
            </div>
          </details>
        ))}

        <div style={{ textAlign: "center", fontSize: 9, color: "#2a2a3a", padding: "16px 0 24px" }}>
          v4 · 完整版 · 含爆户风险
        </div>
      </div>
    </div>
  );
}
