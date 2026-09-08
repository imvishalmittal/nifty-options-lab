import Link from "next/link";
import ProfitOnlyLedger from "../profit-only-ledger";

export default function ProfitOnlyPage() {
  return <main style={{ minHeight: "100vh", background: "#f6f8fc", padding: 24 }}>
    <div style={{ maxWidth: 1800, margin: "0 auto" }}>
      <header style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div><p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "#64748b" }}>NIFTY Options Lab</p><h1 style={{ margin: "4px 0 6px", fontSize: 34 }}>Profit-only Strategy Lab</h1><p style={{ margin: 0, color: "#64748b" }}>Discovery, untouched validation, and prospective paper observations—kept separate.</p></div>
        <nav style={{ display: "flex", gap: 8 }}><Link href="/paper" style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 14px", textDecoration: "none", color: "#0f172a", background: "white", fontWeight: 700 }}>Main paper dashboard</Link><Link href="/" style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: "10px 14px", textDecoration: "none", color: "#0f172a", background: "white", fontWeight: 700 }}>Learning dashboard</Link></nav>
      </header>
      <ProfitOnlyLedger />
    </div>
  </main>;
}
