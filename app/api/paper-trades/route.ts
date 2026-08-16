import { NextResponse } from "next/server";

const LIVE_LEDGER_URL =
  "https://raw.githubusercontent.com/imvishalmittal/nifty-options-lab/main/public/paper/trades.json";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(`${LIVE_LEDGER_URL}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Live paper ledger unavailable" },
        { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    const payload = await response.json();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json(
      { error: "Live paper ledger unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
