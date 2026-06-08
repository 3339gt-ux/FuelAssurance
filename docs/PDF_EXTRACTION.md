# PDF Extraction & AS24 Parsing Model

AS24 invoices are delivered as native PDF documents containing nested transaction records, country-level tax statements, and electronic toll reports. Unlike flat spreadsheets, PDF data must be extracted from a raw character stream. This document details the AS24 PDF parsing approach, spatial structure extraction, registration-odometer splitting, control totals reconciliation, and the correction workflow.

---

## 1. Native Text Extraction vs. OCR

The Fuel Assurance system currently operates on **native PDF text extraction**.

```
┌─────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
│ Upload AS24 PDF │ ───> │ Extract Character Stream│ ───> │  Regex-Based Section    │
│  (Native Text)  │      │    (using pdf-parse)    │      │        Splitting        │
└─────────────────┘      └─────────────────────────┘      └─────────────────────────┘
                                                                       │
                                                                       ▼
┌─────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
│ Canonical Rows  │ <─── │   Control Totals Verification   │ <─── │ Extract Details & Math  │
│  (Decimal.js)   │      │   (Compare Sum vs Statement)│      │  (Split Reg/Odo, Right) │
└─────────────────┘      └─────────────────────────┘      └─────────────────────────┘
```

* **Native Extraction:** Standard AS24 PDFs contain readable text layers. The system reads this character stream directly using `pdf-parse`, extracting exact text vectors, spaces, and line feeds. This guarantees 100% character accuracy, avoiding the processing overhead and character recognition errors associated with OCR.
* **OCR Fallback (Future Plan):** For scanned paper invoices or low-quality image PDFs, a future iteration will introduce an OCR pipeline (such as Tesseract or AWS Textract). Scanned uploads are currently rejected, and the system requires native vector PDF uploads.

---

## 2. Section Boundaries & Offset Detection

The extracted PDF text is normalized (replacing non-breaking spaces `\xA0` with standard spaces) and parsed into three separate sections by locating key anchors (`detectSections`):

1. **`INVOICE_STATEMENT` (Summary & Control Totals):**
   * **Start Anchor:** Beginning of document (offset `0`).
   * **End Anchor:** The index of the phrase `"CARDS FILLING LIST"` (or `"PASSANGO : TRANSACTION REPORT"` if card filling is absent).
   * **Contents:** Account details, invoice reference numbers, VAT numbers, and country-level summary tables.
2. **`CARD_FILLING_LIST` (Fuel, Tolls, Parking):**
   * **Start Anchor:** The index of `"CARDS FILLING LIST"`.
   * **End Anchor:** The index of `"PASSANGO : TRANSACTION REPORT"` (or the end of the text stream if PASSango is absent).
   * **Contents:** Direct station purchases, itemized by fuel card.
3. **`PASSANGO` (Electronic Toll System):**
   * **Start Anchor:** The index of `"PASSANGO : TRANSACTION REPORT"`.
   * **End Anchor:** End of the document.
   * **Contents:** GPS-tracked highway toll segments billed via on-board units.

---

## 3. The Details Parsing Engine

### A. Card Invoicing Detail Lines
Within the `CARD_FILLING_LIST`, the parser tracks card headers and detail lines:
* **Card Headers:** Identified using the regex `^\s*\*\s*([\d\-]+)\s+(IE-\s*)?([0-9]{3}\s*[A-Z]{1,2}\s*[0-9]+.*)$`. This pattern extracts the card number (e.g., `0001-2`) and a raw string containing registration and mileage.
* **Detail Lines:** Match a unified pattern: `^\s*(?:\*\s*)?(?:([A-Z0-9]{2})\s+([A-Za-z\s\*]+?)\s*)?(?:(\d{2})?\s*([A-Z]{3})\s+(\w{4})\s+)`. This identifies the product code (e.g. `03` for Diesel), product name, country code (e.g., `IRL`), station code (e.g., `B032`), station name, and transaction date/time.
* **Inheritance Rules:** If consecutive transaction lines omit the product code or name (common when a card has multiple transactions of the same product), the parser automatically inherits the values from the preceding line.

### B. PASSango Invoicing Detail Lines
Tolls are billed under vehicle registration and OBU blocks:
* **Vehicle Blocks:** Identified by registrations starting with `IE-` followed by the OBU's 10-digit identification number.
* **Toll Lines:** Match the pattern `^\s*(\d{2}\/\d{2}\/\d{4})` (identifying the transaction date). It extracts the transaction reference (e.g. `2026-FLN-0000041522`), the region name (e.g. `Bruxelles Sofico`), and the trailing numeric sequence containing distance, net cost, and gross cost.

---

## 4. Odometer and Registration Splitting Logic

In the AS24 PDF, the vehicle registration plate and odometer reading are concatenated into a single string (e.g., `241 MH 236261000` or `252MH145332000`). The parser separates them using strict rules based on Irish registration plate formats (`splitRegAndOdo`):

```
                       Concatenated String
                                │
             ┌──────────────────┴──────────────────┐
             ▼                                     ▼
        241 MH Reg                            252 MH Reg
  (3-digit numeric sequence)             ┌─────────┴─────────┐
             │                           ▼                   ▼
             │                      Starts with 1     Starts with 7 or 8
             │                     (4-digit sequence)  (3-digit sequence)
             ▼                           ▼                   ▼
    Reg: 241MH236                       Reg: 252MH1453      Reg: 252MH761
    Odo: 261000                         Odo: 32000          Odo: 8
```

1. **The 241 MH Pattern:** Irish registrations from the year 2024 (e.g., `241 MH \d{3}`).
   * **Regex:** `/^(241\s*MH\s*(\d{3}))(\d*)$/i`
   * **Example:** `241 MH 236261000` splits into Registration `241MH236` and Odometer `261000`.
2. **The 252 MH (Starts with 1) Pattern:** Irish registrations from 2025 containing a 4-digit sequence starting with 1.
   * **Regex:** `/^(252\s*MH\s*(1\d{3}))(\d*)$/i`
   * **Example:** `252MH145332000` splits into Registration `252MH1453` and Odometer `32000`.
3. **The 252 MH (Starts with 7 or 8) Pattern:** Irish registrations from 2025 containing a 3-digit sequence starting with 7 or 8.
   * **Regex:** `/^(252\s*MH\s*([78]\d{2}))(\d*)$/i`
   * **Example:** `252MH7618` splits into Registration `252MH761` and Odometer `8`.
4. **Fallback Split:** If the pattern does not match the 241 or 252 rules, and the numeric string length exceeds 8, the odometer is extracted from the remaining right-hand digits. Otherwise, odometer defaults to `0`.

---

## 5. Right-Side Numeric Sequence Extraction

PDF text generators do not output clean column boundaries; they output a single string of space-separated text. Because numeric values can contain spaces or dots, they cannot be split reliably using spaces.

The AS24 parser resolves this by using a **Right-to-Left Decimal Stepping Parser** (`parseRightSide`).
Knowing that the card detail row ends with exactly 7 numeric values with fixed decimal places, the parser starts from the right of the string and steps backward:

$$\begin{array}{rcccl}
\text{Step 1 (Amount Incl. VAT):} & \text{last dot} & + 2 \text{ decimals} & \rightarrow & \text{slice and remove} \\
\text{Step 2 (Amount Excl. VAT):} & \text{last dot} & + 2 \text{ decimals} & \rightarrow & \text{slice and remove} \\
\text{Step 3 (VAT amount):} & \text{last dot} & + 2 \text{ decimals} & \rightarrow & \text{slice and remove} \\
\text{Step 4 (Net price per unit):} & \text{last dot} & + 2 \text{ decimals} & \rightarrow & \text{slice and remove} \\
\text{Step 5 (Rebate/Discount):} & \text{last dot} & + 2 \text{ decimals} & \rightarrow & \text{slice and remove} \\
\text{Step 6 (Gross unit price):} & \text{last dot} & + 3 \text{ decimals} & \rightarrow & \text{slice and remove} \\
\text{Step 7 (Remaining - Base Cost):} & \text{remaining string value} & & \rightarrow & \text{slice and remove}
\end{array}$$

This backward-stepping approach isolates values like `40154.47` or `2 856.04` (ignoring intermediate spaces) without risking alignment drift.

---

## 6. Control Totals & Page Confidence Verification

Once the detail lines are parsed, the system validates the PDF file integrity:
* **Control Totals Verification:** The parser sums the net and gross amounts of all parsed card transactions and PASSango toll records. This sum is compared against the totals extracted from the `INVOICE_STATEMENT` summary section (e.g. `totalGrossAmount: 40154.47`).
* **Page-Level Confidence Metric:** The parser tracks failed rows (lines matching dates but failing numeric decomposition). The page confidence score is calculated as:
  $$\text{Page Confidence} = \frac{\text{Successfully Parsed Rows}}{\text{Total Matched Rows}} \times 100$$
  If this score drops below **98%**, or if the calculated sum does not match the invoice statement total, the file is routed to the **Audit and Correction Workflow**.

---

## 7. Audit & Correction Workflow

When a PDF fails verification, it is flagged in the **Mapping and Review Queues**:
1. **Highlight Discrepancies:** The UI highlights the expected control total vs the computed total.
2. **Review Concatenated Strings:** The operator is shown any card registration strings that failed to split (e.g., non-standard registrations).
3. **Manual Overrides:** The operator can manually assign registration plates or correct odometer readings.
4. **Reprocess:** Once corrected, the row is re-normalized and the control totals are validated again. The original raw text remains unchanged in the reasoning ledger to preserve the audit trail.
