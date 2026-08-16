import Link from "next/link";
import PaperLedger from "../paper-ledger";

export default function PaperTradingPage() {
  return <main style={{ minHeight: "100vh", background: "#f6f8fc", padding: "24px" }}>
    <div style={{ maxWidth: 1800, margin: "0 auto" }}>
      <header style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div><p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "#64748b" }}>NIFTY Options Lab</p>
          <h1 style={{ margin: "4px 0 6px", fontSize: 34 }}>Paper Trading Dashboard</h1>
          <p style={{ margin: 0, color: "#64748b" }}>₹180 momentum strategy · ₹60,000 model capital · automatic trailing stop · no broker orders</p></div>
        <Link href="/" style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 14px", textDecoration: "none", color: "#0f172a", background: "white", fontWeight: 700 }}>Learning dashboard</Link>
      </header>
      <PaperLedger />
    </div>
  </main>;
}
