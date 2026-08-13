# Safety and Limitations

## Intended use

NIFTY Options Lab is an educational and paper-trading tool. It helps a beginner
follow a fixed checklist and understand why a setup is blocked, waiting, or
eligible for paper execution.

It is not:

- financial or investment advice;
- a prediction service;
- a SEBI-registered advisory product;
- a broker terminal;
- an order-management system;
- a guarantee that displayed inputs, calculations, or outcomes are correct.

## Financial risk

Options can lose value rapidly, including the entire premium paid. Leverage,
volatility, time decay, spreads, slippage, taxes, charges, and liquidity can
make actual outcomes materially worse than simple premium calculations.

The ₹5,000 capital and ₹300 risk limits are learning constraints, not a claim
that losses are negligible. Multiple losses and execution errors can still
deplete the account.

## Data limitations

V0.1 does not independently verify:

- live NIFTY prices;
- candle completion;
- EMA, ADX, or DI calculations;
- exchange holidays or expiry adjustments;
- current lot size or strike interval;
- current option premium, spread, depth, or liquidity;
- whether the entered expiry is truly the nearest weekly expiry;
- whether the broker accepted or filled an order.

Inputs must be confirmed from an authoritative market-data or broker surface.
Exchange-controlled contract specifications must be checked before live use.

## Screenshot limitations

Uploaded images are currently used for local preview only. No automated
extraction occurs in V0.1.

When vision extraction is introduced:

- low-resolution or cropped screenshots must produce `DATA UNCERTAIN`;
- every extracted value must include confidence and provenance;
- critical facts must require user confirmation;
- the deterministic rules engine must remain the only component that assigns a
  strategy state;
- screenshots must not be retained without an explicit policy and user intent.

## Execution limitations

The dashboard does not:

- log in to a broker;
- place, modify, or cancel orders;
- monitor an open position;
- enforce a stop;
- calculate all fees and taxes;
- prevent the user from trading outside the rules.

All execution remains manual.

## Safe failure

The system should prefer a missed trade to an unsafe recommendation.

Any critical uncertainty should result in `DATA UNCERTAIN` or `NO TRADE`.
Do not silently substitute:

- a different strike;
- a later expiry;
- a wider stop;
- a larger risk limit;
- another trade after the daily limit.

## Before considering live use

At minimum:

1. complete a meaningful paper-trading sample;
2. add deterministic unit tests for every state transition and edge case;
3. source exchange specifications dynamically;
4. account for charges, spread, and slippage;
5. validate data freshness and completed candles automatically;
6. implement an auditable journal;
7. perform a security and privacy review;
8. obtain appropriate professional and regulatory guidance.
