# Data Normalisation Rules

The normalisation layer (`src/domain/normalisation/normaliser.ts`) serves as the gatekeeper of data quality in the Fuel Assurance system. It transforms raw, heterogeneous data parsed from fuel card provider spreadsheets and PDFs into clean, type-safe, canonical models. This document describes the specific rules applied to station codes, card numbers, Excel dates, numeric values, country inheritance, and timezones.

---

## 1. Normalisation Flow

Raw parsers extract records directly from files without altering text, date serials, or currency representations. The normalisation layer then processes these records:

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│   Raw Parser Output    │ ───> │ Normalisation Layer Run│ ───> │ Canonical Domain Types │
│  (Varying structures)  │      │  (Apply cleaning rules)│      │  (Standardised schemas)│
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

Downstream engines (Reconciliation, Financial, and Telematics) require uniform, typed values. The normalisation layer guarantees that:
* Station codes from different providers match without prefix mismatches.
* Card numbers match without whitespace variations.
* All financial sums are represented as standard decimal strings.
* Dates and times use standard ISO-8601 representation.

---

## 2. Station Code Normalisation

Station identifiers are formatted differently across fuel networks (e.g. DKV, AS24, and yard pumps). To resolve these differences, the system normalises station codes (`normaliseStationCode`):

1. **Whitespace Trimming:** Removes leading and trailing whitespace.
2. **SS Prefix Stripping:** If the code starts with the characters `SS` or `ss` (case-insensitive), this prefix is removed. For example:
   $$\text{"SS091234"} \rightarrow \text{"091234"}$$
3. **Leading Zero Removal:** Removes leading zeroes while retaining at least one digit if the code is entirely numeric:
   $$\text{"000456"} \rightarrow \text{"456"}$$
   $$\text{"000"} \rightarrow \text{"0"}$$
   $$\text{"SS0045"} \rightarrow \text{"45"}$$

This standardisation ensures that station `SS091234` in the DKV invoice file matches station `0091234` in the station master file.

---

## 3. Fuel Card Number Normalisation

Fuel card numbers are often formatted with spaces to make them easier for drivers to read. 

To ensure clean matching, card numbers are normalised using the following rules (`normaliseCardNumber`):
1. **Whitespace Trimming:** Removes leading and trailing spaces.
2. **Internal Space Stripping:** Removes all internal spaces or non-breaking spaces.
3. **Leading Zero Preservation:** **Never** strip leading zeroes from card numbers. Fuel card networks use leading zeroes to indicate card batches and customer divisions; stripping them would break card identity mappings.
   $$\text{"7824 0012 3456"} \rightarrow \text{"782400123456"}$$
   $$\text{"0009 8765 4321"} \rightarrow \text{"000987654321"}$$

---

## 4. Excel Serial Date Conversion

Excel stores dates and times as serial numbers representing the fractional number of days since January 1, 1900. Additionally, Excel inherits the Lotus 1-2-3 leap year bug, incorrectly treating 1900 as a leap year.

The conversion logic (`excelDateToJSDate`) standardizes these serials:
1. **Epoch Offset:** Subtracts `25569` days to align Excel's epoch (1900-01-01) with the Unix epoch (1970-01-01).
2. **Whole Days Conversion:** Calculates whole days and converts them to milliseconds.
3. **Fractional Day Conversion:** Computes the fractional day, converting it to hours, minutes, and seconds:
   $$\text{Total Seconds} = \text{Round}(\text{Fractional Day} \times 86400)$$
4. **Precision Classification:**
   * If the fractional day is negligible ($< 0.0001$ of a day, or less than 8 seconds), the timestamp is classified as `TimestampPrecision.DATE_ONLY`.
   * If a significant fractional day is detected, it is classified as `TimestampPrecision.EXACT`.

---

## 5. Numeric Formats & Coordinates

Source files use localized decimal formatting. For example, continental European spreadsheets may write coordinates as `53,3498` or costs as `1,0850` instead of `53.3498` and `1.0850`.

* **Coordinate Parsing:** Latitude and longitude coordinates parsed from DKV station master sheets are normalized by replacing commas with dots and parsing them as floats:
  $$\text{"53,3498"} \rightarrow 53.3498$$
* **Invalid Numbers:** If a coordinate or speed field contains text that cannot be parsed (e.g. `N/A` or `-`), it is normalized to `null` rather than generating a parsing error.
* **Telemetry Values:** GPS speed and fuel levels are parsed as floats (`parseFloat`), ensuring clean comparison ranges.

---

## 6. Country Inheritance Handling

The DKV approved station worksheet maps stations by country, but only lists the country name on the first row of a country section. If the country cell is empty on subsequent rows, it must inherit its country value.

* **Inheritance State:** The normalisation layer maintains a state variable (`lastCountry`) during the processing of the worksheet.
* **Value Propagation:** If the country cell is populated, `lastCountry` is updated. If the cell is empty, the row is assigned the current value of `lastCountry`.
* **Standardisation:** Country names are normalized to standard ISO three-letter codes (e.g., `Ireland` $\rightarrow$ `IRL`, `Belgium` $\rightarrow$ `BEL`).

---

## 7. Timezone Standardisation

Because fuel transactions can span multiple countries, timezones must be normalized:
* **ISO-8601 UTC:** All timestamps are converted to ISO-8601 strings in UTC format (e.g. `YYYY-MM-DDTHH:mm:ss.sssZ`).
* **Time-Less Records:** If a transaction record contains a date but no time component (such as a PASSango toll line or a date-only invoice line), the time is set to midnight UTC (`00:00:00.000Z`) and marked with `TimestampPrecision.DATE_ONLY`.
* **Local Adjustments:** When comparing transactions to GPS logs, the system converts UTC times back to localized coordinates based on the service country (e.g. applying Irish Standard Time or Central European Time offsets) to ensure accurate time windows.
