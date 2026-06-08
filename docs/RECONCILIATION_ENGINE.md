# Reconciliation Engine Specification

The Reconciliation Engine (`src/domain/reconciliation/matching-engine.ts`) is the core matching system of the Fuel Assurance platform. It cross-references canonical pre-authorisation transactions with final provider invoices to identify billing discrepancies, missing invoices, and unauthorized card usage.

---

## 1. Engine Processing Flow

Reconciliation operates as a multi-stage, progressive matching pipeline. By executing high-certainty rules first and relaxing parameters in later stages, the engine maximizes the match rate while preventing false positives.

```
      Canonical Transactions & Invoice Rows Ingested
                            │
               Assess Invoicing Period Alignment
                (Overlaps and date range checks)
                            │
                            ▼
                Stage 1: Exact Authorisation ID
              (Card, Vehicle, and Pump details match)
                            │
                            ▼
              Stages 2–4: Strict Identity Matches
             (Card + Vehicle + Product + Qty/Time)
                            │
                            ▼
             Stages 5–7: Loose Identity Matches
           (Vehicle + Station/Country + Qty/Time)
                            │
                            ▼
            Stages 8–9: Broad Fallback Matches
          (Card/Vehicle + Qty/Amount + Time Window)
                            │
                            ▼
            One-to-One Match Constraints Applied
          (Lock matches, output unmatched records)
```

---

## 2. The 9-Stage Matching Priority

The engine processes matches sequentially through 9 stages. Once a transaction or invoice row is matched in an early stage, it is locked (one-to-one protection) and excluded from downstream stages.

### Stage 1: Exact Authorisation ID Match
* **Matcher Logic:** Compares DKV authorization IDs or AS24 reference numbers against the invoice transaction number.
* **Requirements:** Exact match of the unique transaction identification number.
* **Status Assigned:** `EXACT_MATCH`
* **Confidence Rating:** 95%

### Stage 2: Card, Vehicle, Product, Station, and Quantity Match
* **Matcher Logic:** Looks for transactions where the normalized card number, vehicle registration, product code, normalized station code, and quantity match exactly.
* **Requirements:** All five values match.
* **Status Assigned:** `EXACT_MATCH`
* **Confidence Rating:** 95%

### Stage 3: Card, Vehicle, Product, Country, and Quantity Match
* **Matcher Logic:** Similar to Stage 2, but allows the station code to differ if the transaction took place in the same country. This handles cases where pump codes are recorded differently in transaction files than on invoices.
* **Requirements:** Card, vehicle, product, country, and quantity match exactly.
* **Status Assigned:** `EXACT_MATCH`
* **Confidence Rating:** 85%

### Stage 4: Card, Vehicle, Product, Quantity, and Time Match
* **Matcher Logic:** Matches card, vehicle, product, and quantity within a configurable date/time window (defaulting to 2 days). Station number and country can vary.
* **Requirements:** Matches card, vehicle, product, quantity, and time within tolerance.
* **Status Assigned:** `EXACT_MATCH`
* **Confidence Rating:** 85%

### Stage 5: Vehicle, Product, Station, Quantity, and Time Match
* **Matcher Logic:** Relaxes the card number constraint. This resolves situations where a card was swapped or a temporary OBU was used, but the vehicle registration, product, station, quantity, and time window align.
* **Requirements:** Matches vehicle, product, station code, quantity, and time.
* **Status Assigned:** `STATION_CODE_MATCH`
* **Confidence Rating:** 70%

### Stage 6: Vehicle, Product, Amount, and Time Match
* **Matcher Logic:** Relaxes quantity constraints but matches on gross/net amount and time window. This handles cases where different rounding methods were applied to quantities, but the billed monetary value is within a 1.0% tolerance of the pre-authorised amount.
* **Requirements:** Matches vehicle, product, gross amount (within tolerance), and time.
* **Status Assigned:** `COMPOSITE_MATCH`
* **Confidence Rating:** 70%

### Stage 7: Vehicle, Country, and Time Match
* **Matcher Logic:** A weak matching stage that matches vehicle registration, service country, and a tight 24-hour time window. Used for final consolidation.
* **Requirements:** Matches vehicle, country, and time within 24 hours.
* **Status Assigned:** `COMPOSITE_MATCH`
* **Confidence Rating:** 55%

### Stage 8: Card, Product, Quantity, and Time Match (Tolerates Registration Anomalies)
* **Matcher Logic:** Matches card number, product, quantity, and time window, but ignores registration plates. This captures transactions where a driver entered an incorrect registration code at the pump, but the card and fuel amount are verified.
* **Status Assigned:** `CARD_ALIAS_MATCH`
* **Confidence Rating:** 50%

### Stage 9: Vehicle, Amount, and Time Fallback Match
* **Matcher Logic:** Fallback stage linking vehicle registration and gross cost within a broad 5-day window. Used as a catcher for manual alignment queues.
* **Status Assigned:** `COMPOSITE_MATCH`
* **Confidence Rating:** 40%

---

## 3. One-to-One Matching Protection

A critical rule of the Reconciliation Engine is **One-to-One Protection**. 
* **Preventing Double Counts:** Once a transaction is linked to an invoice row, both records are added to `matchedTxIds` and `matchedInvIds` sets. They cannot be reassigned or matched to any other row.
* **Duplicate Candidates:** If multiple transactions match a single invoice row (e.g. duplicate pre-authorisation attempts), the engine matches the closest candidate in time and quantity, and flags the remaining transactions as `DUPLICATE_CANDIDATE` to prevent multiple invoice matches.

---

## 4. Quantity and Unit Tolerance Configuration

To prevent rounding differences from breaking matching logic, the system applies quantity tolerances:
* **Litre-Based Products (Fuel):** For liquid fuel products (Diesel, GNR, AdBlue), the engine allows a configurable tolerance (defaulting to **±0.02 Litres**). If a transaction reports `400.00L` and the invoice shows `400.01L`, it is matched as a `QUANTITY_TOLERANCE_MATCH`.
* **Non-Litre Products:** For pieces, tolls, parking, and services, no tolerance is allowed. The quantity must match exactly.
* **Amount Tolerance:** Matches based on value allow a configurable percentage tolerance (defaulting to **1.0%** of the transaction amount).

---

## 5. Master Status Definitions (27 Reconciliation Statuses)

The system defines 27 reconciliation statuses to classify every outcome:

### Perfect / Near-Perfect Matches
1. `EXACT_MATCH`: Columns match exactly.
2. `QUANTITY_TOLERANCE_MATCH`: Matches, but quantity differs within the ±0.02L tolerance.
3. `UNIT_PRICE_TOLERANCE_MATCH`: Unit price differs within the configured tolerance.
4. `DATE_TOLERANCE_MATCH`: Timestamps align within the date tolerance window.
5. `CROSS_MIDNIGHT_MATCH`: Shift-change transaction that crossed midnight between authorization and invoicing.
6. `CARD_ALIAS_MATCH`: Card matched via alias history.
7. `STATION_CODE_MATCH`: Station matched using a registered station code alias.
8. `VEHICLE_ALIAS_MATCH`: Registration matched via date-aware vehicle alias.
9. `COMPOSITE_MATCH`: Match established using a combination of secondary dimensions.

### Discrepancies & Variances
10. `AMOUNT_MISMATCH`: Billed cost differs from transaction amount.
11. `DATE_MISMATCH`: Dates do not align within tolerances.
12. `CARD_MISMATCH`: Discrepancy between card used and card billed.
13. `STATION_MISMATCH`: Discrepancy between station authorized and station billed.
14. `PRODUCT_MISMATCH`: Product billed does not match product authorized.
15. `DUPLICATE_CANDIDATE`: Multiple transactions exist for a single invoice line.

### Unmatched Records
16. `TX_ONLY`: Transaction exists, but no corresponding invoice row was found.
17. `INV_ONLY`: Invoice row exists, but no corresponding pre-authorisation transaction was found.

### Financial Discrepancies
18. `PRICE_VARIANCE`: Invoiced price per unit exceeds the approved station price.
19. `VAT_VARIANCE`: Calculated VAT differs from invoiced VAT.
20. `FEE_VARIANCE`: Service fee net calculation mismatch.
21. `DISCOUNT_VARIANCE`: Contracted rebate/discount net mismatch.
22. `CURRENCY_VARIANCE`: Currency conversion variance between service country and billing currency.

### Telematics Scoring Statuses
23. `TELEMATICS_VERIFIED`: Transaction matched and confirmed by GPS telematics.
24. `TELEMATICS_UNLIKELY`: Transaction matched but flagged as unlikely by GPS telematics.
25. `NO_TELEMATICS`: Transaction matched, but no telematics data was available.

### Procedural Statuses
26. `DECLINED`: Transaction was declined by the provider.
27. `PERIOD_MISMATCH`: Transaction occurred outside the active invoicing period window.

---

## 6. Period Alignment Logic

Before matching transactions, the system runs a **Period Alignment Check** (`assessPeriodAlignment`) to evaluate the relationship between transaction date ranges and invoice date ranges:
* **FULL_OVERLAP:** Transaction and invoice files cover the same date ranges.
* **PARTIAL_OVERLAP:** Only a portion of the files overlap. The system generates a warning and blocks automated sign-off.
* **NO_OVERLAP:** The date ranges do not overlap. The reconciliation run is blocked.
* **ADJUSTMENT_PERIOD:** The run is flagged as an adjustment period when resolving historical invoices.
* **UNKNOWN:** Missing dates in files; blocks automated sign-off.
