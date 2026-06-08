# Approved Stations Model & Price Lookups

The **Approved Stations Model** (`src/domain/parsers/stations/station-parser.ts`) manages station identifiers, geographic coordinates, and contracted pricing structures across different fuel card networks. It supports effective-dated prices, discounts, and rebates, allowing the Financial Validation Engine to detect overbilling.

---

## 1. Multi-Provider Station Master Structure

The platform ingests approved stations and pricing lists via a multi-sheet Excel workbook. This workbook contains three sheets with different structures, header configurations, and data semantics:

```
                  Approved Station Workbook (.xlsx)
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
    Sheet 1: Yard_DKV      Sheet 2: Red_Diesel    Sheet 3: Diesel_AS24
   (Country Inheritance)   (Explicit Country)     (Explicit Country)
   (Typo: LATTITUDE)       (AS24 Code Formats)    (AS24 Code Formats)
   (Latitude/Longitude)    (No GPS Coordinates)   (No GPS Coordinates)
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                ▼
                      Normalisation Pipeline
                     (normaliseStationCode)
                                │
                                ▼
                       Canonical Station DB
                   (Stable UUID, Effective Dates)
```

### A. DKV Sheet: `Yard, DKV Prices`
This sheet lists yard pumps and participating DKV network stations.
* **Country Inheritance:** The country name (e.g. `Ireland`, `Belgium`) is only populated on the header row of a country block. Subsequent rows leave this column blank. The parser resolves this by carrying forward the `lastCountry` value:
  $$\text{If Country Cell is empty} \rightarrow \text{Inherit from preceding row}$$
* **Header Quirks (Typographical Errors):** The coordinate column headers are misspelled as `LATTITUDE` and `LONGTITUDE`. The Column Alias Registry maps these typos to canonical database properties:
  * `LATTITUDE` $\rightarrow$ `latitude`
  * `LONGTITUDE` $\rightarrow$ `longitude`
* **Station Code Mapping:** Discovered via the column header `CODE (DKV APP)`.

### B. AS24 Sheets: `Red Diesel (Fridge) Prices (AS24)` & `Diesel Prices (AS24)`
These sheets record station networks and pricing for AS24.
* **Red Diesel / GNR:** Maps Gasoil Non-Routier (red diesel) used for refrigeration units.
* **Standard Diesel:** Maps standard road diesel.
* **Country Handling:** Every row lists the country explicitly (`Full Country Name`).
* **Coordinates:** Coordinates are not provided on AS24 sheets. Proximity checks for AS24 transactions must rely on text matches against the town/address field.
* **Effective Date:** Discovered via the column header `Date of Application`.

---

## 2. Station Code Normalisation & Aliases

Because fuel card providers format station codes differently (e.g., using prefix codes or padding values with zeroes), direct matches would fail without normalization.

The system applies the following cleaning rules (`normaliseStationCode`):
1. **Trim:** Removes surrounding whitespace.
2. **SS Strip:** Removes prefix characters `SS` or `ss` (case-insensitive).
3. **Zero Strip:** Strips leading zeroes while preserving at least one digit (e.g. `000045` becomes `45`).

### Examples of Station Code Normalisation:
* **DKV Invoice code:** `"SS0045"` normalises to `"45"`.
* **DKV Master code:** `"45"` normalises to `"45"` (direct match).
* **AS24 Invoice code:** `"0045"` normalises to `"45"` (direct match).

### Station Aliases
If a station changes ownership or updates its identifier, the system uses an alias lookup registry. This maps multiple physical codes back to a single canonical station ID, ensuring historical pricing queries remain valid.

---

## 3. Effective-Dated Price Lookups

Pricing is not static. Contracts specify pricing structures that vary based on dates of application.

### Pricing Model
A station price entry is bound to an active date range:
* `costPerLitre`: The baseline unit cost.
* `discount`: The contracted discount per litre.
* `exciseDutyRebate`: Reclaimable tax rates.
* `effectiveFrom` / `applicationDate`: The date when these rates become active.
* `effectiveTo`: The date when these rates are replaced by a new price sheet (defaulting to a future date if still active).

### The Lookup Algorithm
When validating an invoice row, the engine queries the pricing database:
1. Filters the approved station list by the normalized station code and provider (`DKV` or `AS24`).
2. Identifies the record where the transaction date is within the effective interval:
   $$\text{effectiveFrom} \le \text{transactionDate} \le \text{effectiveTo}$$
3. Returns the applicable rates (`cost`, `discount`, `rebate`).

If no matching pricing record is found for the transaction date, the row is routed to the **Financial Review Queue** for manual rate confirmation.
