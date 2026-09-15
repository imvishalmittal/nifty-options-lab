# Video option-selling research specifications

These are separate research workflows. None changes the paper-trading V2–V8 definitions or authorizes broker orders.

## Exact HAI 1:3:2 call ratio

Source: [Dhan — Hedge Like a Pro](https://www.youtube.com/watch?v=6el9Jqnrdz8), strategy segment approximately 40:48–56:38, published 25-Jan-2026.

| Rule | Frozen implementation |
| --- | --- |
| Underlying | NIFTY |
| Entry | Monday 09:45, using the 09:45 synchronized option opens |
| Expiry | First listed NIFTY expiry after Friday (the following Tuesday contract) |
| Anchor | NIFTY rounded upward to the next 100, including a 50-ending spot |
| Legs | Buy 1 CE at anchor+200; sell 3 CE at +400; buy 2 CE at +600 |
| Rich-credit filter | Shift all three strikes outward by 100 until credit is no more than 0.6% of scaled capital |
| Capital | ₹140,000 at lot size 65, scaled linearly with historical lot size |
| Exit | +1% capital target, −1% capital stop, otherwise Friday 15:15 |
| Execution | Completed-close threshold then next synchronized open; overnight gaps fill at the first open; no re-entry |
| Costs | Historical Groww charges plus 0, 0.5 and 1.0 point adverse slippage per unique option leg |

Tuesday NIFTY weekly expiries only began in September 2025, so an exact five-year test is impossible. The full available period is reported, but only Mondays after the video publication date are used by the frozen replication gate.

## Additional videos reviewed

| Video | Mechanical idea | What is explicit | What is missing for a faithful backtest |
| --- | --- | --- | --- |
| [Reality of passive income](https://www.youtube.com/watch?v=d3X5TNpZ0NM) | Large-cap stock bear-call spread after a 2-hour reversal | Williams %R(140) falls from overbought; 5 EMA < 15 EMA < 50 EMA; sell a 20–25 delta call; buy a higher call; exit when 5 EMA crosses above 50 EMA; caution above India VIX 20 | Exact monthly expiry rule, exact hedge width, exact meaning/action for VIX caution, same-bar vs next-bar execution |
| [Step-by-step option selling](https://www.youtube.com/watch?v=zbx0fQvyph0) | Monthly ultra-large-cap short strangle / partly hedged iron condor | Watchlist examples; daily and weekly RSI weakness; avoid corporate actions; roughly +0.10 delta call and −0.12 delta put; example put hedge near −0.06 delta | Numerical RSI threshold, fixed entry date/time, exact call-hedge rule, numerical stop and exit rule |
| [Smart strangle strike selection](https://www.youtube.com/watch?v=MSdkBg-hW_I) | NIFTY short strangle selected by displayed probability/ROI | Demonstrates progressively moving from 0.20 to 0.10 to 0.08 delta; seeks roughly 75–80% displayed probability and about 1% weekly ROI | It is strike-selection education, not a complete trading system: no exact entry clock, stop, adjustment, hedge, or exit rule |

The first additional video is the only one close to a deterministic strategy. It will be researched separately with every missing choice named and frozen before results are viewed. The two strangle videos must not be represented as exact replications unless their omitted risk and timing rules are supplied.
