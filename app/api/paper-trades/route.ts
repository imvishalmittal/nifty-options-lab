import { NextResponse } from "next/server";

const RAW_ROOT =
  "https://raw.githubusercontent.com/imvishalmittal/nifty-options-lab/main/public/paper";

export const dynamic = "force-dynamic";

async function fetchJson(path: string, required = true) {
  const response = await fetch(`${RAW_ROOT}/${path}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    if (!required) return null;
    throw new Error(`${path} unavailable (${response.status})`);
  }
  return response.json();
}

export async function GET() {
  try {
    const [ledger, sessionJournal, openingRangeShadow] = await Promise.all([
      fetchJson("trades.json"),
      fetchJson("sessions.json", false),
      fetchJson("opening-range-shadow.json", false),
    ]);
    return NextResponse.json(
      {
        meta: ledger?.meta ?? {},
        trades: Array.isArray(ledger?.trades) ? ledger.trades : [],
        sessions: Array.isArray(sessionJournal?.sessions) ? sessionJournal.sessions : [],
        sessionMeta: sessionJournal?.meta ?? {},
        openingRangeShadow: openingRangeShadow ?? { meta: {}, sessions: [] },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Live paper journal unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
