# Parser Architecture & Drift Detection

The Fuel Assurance parser layer is designed to handle the structural variability of spreadsheets and documents provided by different fuel networks. It separates physical file reading from data normalisation, using a dynamic **Schema Discovery Engine** and a **Template Drift Detection** mechanism to maintain pipeline stability.

---

## 1. Parser Layer Design & Pipeline Flow

The parsing pipeline executes in three strict stages before any reconciliation or scoring occurs:

```
┌─────────────────┐      ┌─────────────────────────────┐      ┌───────────────────────────┐
│ Ingest Raw File │ ───> │   Schema Discovery Engine   │ ───> │  Template Drift Detection  │
└─────────────────┘      └─────────────────────────────┘      └───────────────────────────┘
                                                                            │
                                                                            ▼
┌─────────────────┐      ┌─────────────────────────────┐      ┌───────────────────────────┐
│ Canonical Output│ <─── │     Normalisation Layer     │ <─── │      Raw Parsers Run      │
└─────────────────┘      └─────────────────────────────┘      └───────────────────────────┘
```

1. **Ingest:** The file is received as an ArrayBuffer. Basic file signature checks ensure it matches the expected MIME type.
2. **Schema Discovery:** The file contents are scanned to detect layout dimensions, locate the header row, and fuzzy-map physical columns to database destination fields.
3. **Drift Assessment:** The discovered column fingerprint is compared against a saved baseline. If columns were added, deleted, or shifted, a drift report is generated, and a severity level is calculated. If the drift is classified as `BREAKING`, processing is suspended to prevent database corruption.
4. **Parsing:** The provider-specific parser reads the cell grid using the index map established during schema discovery.
5. **Normalisation:** Raw strings and numbers are validated, default units are applied, serial dates are converted, and clean, typed objects are generated for downstream engines.

---

## 2. Versioned Profiles & Column Aliases

Rather than hardcoding column indices (e.g. assuming the card number is always in column 4), parsers rely on a versioned configuration profile that uses the **Column Alias Registry** (`src/domain/parsers/core/column-aliases.ts`).

### Heading Aliases mapping
The system defines sets of expected header strings (including translations and common synonyms) for each canonical destination field:

* **DKV Transaction Aliases:** Matches fields like `licencePlate` against headers: `Licence plate`, `License plate`, `Reg`, `Registration`, `Kennzeichen`.
* **DKV Invoice Aliases:** Matches fields like `baseValueNet` against headers: `Base Value Net`, `Base value net`, `Basiswert netto`.
* **GPS Aliases:** Matches fields like `fuelLevel` against headers: `Fuel level`, `Fuel Level`, `Fuel %`, `Tank Level`, `Kraftstoffstand`.
* **Station Master Aliases:** Matches fields like `latitude` against headers: `LATTITUDE`, `LATITUDE`, `Lat`, `Breitengrad`.

### Fuzzy Column Matching Logic
The fuzzy match function (`findBestMatch`) resolves incoming headers to canonical fields:
1. Strips all spaces, underscores, hyphens, brackets, dots, and slashes, converting the string to lowercase.
2. Performs an exact match of the cleaned strings.
3. If no exact match is found, it evaluates substring overlaps.
4. Computes a match confidence ratio:
   $$\text{Confidence} = \frac{\text{Length of shorter string}}{\text{Length of longer string}}$$
5. Accepts matches that meet a confidence threshold of **0.5** (for station sheets) or **0.6** (for transaction/GPS sheets).

---

## 3. Schema Discovery Engine

The Schema Discovery Engine (`src/domain/parsers/core/schema-discovery.ts`) runs dynamically during file upload.

### Header Detection (`detectHeaderRow`)
Spreadsheets often contain metadata rows, blank lines, or title banners before the actual table header. The system scans the first 20 rows of a sheet. It calculates a header score for each row:
$$\text{Row Score} = \text{Non-empty Cells Count} \times \left(\frac{\text{Non-numeric String Cells}}{\text{Non-empty Cells Count}}\right)$$
The row with the highest score is identified as the header row.

### Bounding Box Detection (`detectUsedRange`)
To prevent parsing thousands of empty cells, the system calculates the bounding box of populated cells:
* Finds the first row containing at least one non-empty cell.
* Finds the last row containing at least one non-empty cell.
* Scans all rows within this range to identify the maximum column index containing data.

### Column Type Inference (`inferColumnTypes`)
The engine samples up to 50 data rows following the header row and determines the data type of each column:
* **empty:** Every sampled cell is null or blank.
* **number:** At least 80% of cells are JavaScript numbers.
* **date:** At least 80% of cell values match the ISO date format regex `^\d{4}-\d{2}-\d{2}`.
* **string:** At least 80% of cell values are non-numeric strings.
* **mixed:** Values are a combination of different types.

---

## 4. Structure Fingerprinting & Drift Detection

Once a file is scanned, the system creates a `StructureFingerprint` containing:
* The detected header row index.
* The raw header strings.
* The total column count.
* The data start row (usually header row + 1).
* The column types list.
* The sheet name.

### Drift Comparison (`compareStructure`)
When a file is uploaded, its fingerprint is compared against the baseline fingerprint saved in the parser profile:
* **Added Columns:** Header strings present in the uploaded file but missing in the baseline.
* **Removed Columns:** Header strings present in the baseline but missing in the uploaded file.
* **Reordered Columns:** Headers present in both files but located at different indices.
* **Renamed Columns:** If an added column and a removed column share the same index, the system computes the similarity of their names using character bigrams (Jaccard index). A similarity score above **0.4** indicates a likely column rename.
* **Type Changes:** Headers present in both files that exhibit different inferred types (e.g., odometer numbers changing to text strings).

### Drift Classification
The drift report is classified into five severity levels (`classifyDrift`):

```
┌─────────────────────────────────────────────────────────────┐
│ Drift Report Severity                                       │
├─────────────┬───────────────────────────────────────────────┤
│ NONE        │ No structural differences detected.           │
├─────────────┼───────────────────────────────────────────────┤
│ COSMETIC    │ Minor type changes or data start row moved.   │
├─────────────┼───────────────────────────────────────────────┤
│ MINOR       │ Columns added, reordered, or renamed.         │
├─────────────┼───────────────────────────────────────────────┤
│ MAJOR       │ Columns removed or multiple type changes.     │
├─────────────┼───────────────────────────────────────────────┤
│ BREAKING    │ Required column removed or header row shifted. │
└─────────────┴───────────────────────────────────────────────┘
```

If a upload is flagged as `BREAKING`, the import process halts immediately and generates an alert to prevent import failures.

---

## 5. Canonical Output Format

Upon successful parsing and normalisation, the output is returned in a standard structure matching the TypeScript models in `src/domain/types.ts`:

* **`CanonicalTransaction`:** Standardizes transaction dates and timestamps, normalises station codes (stripping prefixes and leading zeroes), normalises card numbers, classifies products (e.g. mapping `WA0009` to `ProductType.DIESEL`), and extracts gross amounts and mileage.
* **`CanonicalInvoiceRow`:** Standardizes quantities, base values, gross values, service fees, discounts, and VAT as strings to ensure precise decimal arithmetic. It also maps invoice numbers, document dates, ticket numbers, and equipment codes.
* **`CanonicalTelematicsPoint`:** Isolates GPS logs into canonical points containing registration plates, fuel percentages, odometer values, speeds, activities, and text location fields (no geocoded coordinates).
* **`CanonicalStation`:** Standardizes master stations with code, country, name, city, post code, coordinates, net costs, discounts, and rebates.
