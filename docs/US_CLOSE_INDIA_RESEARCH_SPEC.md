# Prior US Close → Next NIFTY Session Research

## Question

Does a negative completed US session predict either a negative NIFTY opening gap or continued weakness after the next Indian open?

## Frozen discovery design

- Sample: 1 January 2022 through 8 September 2026.
- US inputs: S&P 500 and Nasdaq Composite daily closes.
- India input: NIFTY 50 daily open and close.
- Each NIFTY date is paired with the latest completed US session dated before it, preserving weekends and exchange holidays.
- Signal groups are frozen before results: S&P 500 below 0%, at or below −0.5%, at or below −1.0%, and both S&P 500/Nasdaq below 0%.
- Outcomes are kept separate:
  - opening gap: NIFTY open versus previous NIFTY close;
  - intraday continuation: NIFTY close versus that day's open;
  - full-session direction: NIFTY close versus previous NIFTY close.
- Results are reported overall and by calendar year.

## Interpretation rule

A high gap-down probability alone does not justify buying a PE after 09:15 because the US move may already be incorporated in the opening auction. An intraday options hypothesis will only be specified if negative-US sessions show a stable, material increase in negative NIFTY open-to-close outcomes. Any later option backtest must freeze entry timing, strike selection, exits, costs, slippage, discovery, validation and holdout rules before execution.

This study is diagnostic research, not a trading strategy, paper-trading promotion, or live-order authorization.
