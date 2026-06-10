# Parser Rules

## AS24 PDF

- **Volume**: use `Volume` column only — never mileage or litres/100 km.
- **Primary amount**: `Amount ex. VAT` under payment currency.
- **Primary currency**: payment currency (EUR), not station HUF amounts.
- **Registrations**: section-aware Cards Filling and PASSango parsing; no greedy whole-PDF regex.
- **Rebate**: captured and shown; not ignored in financial review.
- Parser versions: `2.0.0-coordinate` (preferred), `1.0.0-fallback`.

## DKV Daily

- Variants: 12-column and 21-column authorisation reports.
- Gross authorisation amount is **not** invoice net.
- Approved (`APP`) vs declined responses distinguished.

## DKV Invoice-Period

- ~40 columns preserved including optional blanks.
- **Value of purchase net** is the purchase net after discount and service fee — not Base Value Net alone.
- Negative discounts (credits) are valid.
- VAT included in payment total where applicable.
- `Value in pay currency` is not labelled ex-VAT.

## GPS

- Multiple files per vehicle supported.
- Bulk attach via batch workspace (up to ~60 files per session).
- Registration normalised via fleet registry.

## Cache

Parse results cached in memory by `sha256(file) + parserVersion`. Duplicate uploads return `alreadyImported` without re-parsing.

## Adding formats

1. Column aliases → schema discovery → parser module.
2. Source detection markers.
3. Synthetic fixture + unit test.
4. Browser acceptance on port 3993.