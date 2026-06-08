# Invoicing and Reconciliation Reporting

The Fuel Assurance reporting engine compiles matched records, financial variances, and telematics scoring data into reports. It supports views ranging from high-level executive summaries to detailed audit records, and includes safety features to prevent spreadsheet security vulnerabilities.

---

## 1. Standard Reports Suite

The system provides five pre-configured reports designed to address common operational and auditing workflows:

```
                            Reporting Database
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
  Executive Summary         Exceptions & Leakage       Station Price Audit
 (Total savings & ROI)     (Fraud & mismatch flags)   (Overbilling detections)
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    ▼
                          Custom Report Builder
                        (User filters & group-bys)
                                    │
                                    ▼
                         Safe Exporter Engine
                     (CSV, XLSX, PDF, HTML Outputs)
                    (Formula Injection Sanitisation)
```

### I. Executive Summary Report
* **Target Audience:** Fleet Operations Directors and CFOs.
* **Contents:** High-level key performance indicators (KPIs) showing total invoice amounts, matched totals, overall match rates, identified price variances, estimated fraud leakage, and system ROI.
* **Visuals:** Summary charts showing spend by fuel provider, trends in variance detection, and telematics confidence distribution.

### II. Exceptions & Leakage Report
* **Target Audience:** Fraud Investigators and Audit Managers.
* **Contents:** Focuses on transactions flagged as high-risk. Includes rows with `UNLIKELY` or `REVIEW` telematics classifications, and invoices with mismatched cards or quantities.
* **Action Item:** Displays direct links to the review queue for manual intervention.

### III. Full Reconciliation Report
* **Target Audience:** Accounts Payable team.
* **Contents:** A detailed grid containing every transaction and matched invoice line.
* **Use Case:** Used as supporting documentation for monthly payment approvals.

### IV. Station Price Audit Report
* **Target Audience:** Procurement and Fuel Contract Managers.
* **Contents:** Lists invoice lines where the billed price per unit exceeded the approved price sheet.
* **Metrics:** Details the unit price variance, quantity purchased, and total overcharged amount. Used to claim rebates from fuel card providers.

### V. Telematics Audit Report
* **Target Audience:** Driver Supervisors and Logistics managers.
* **Contents:** A breakdown of telematics point deductions, detailing odometer anomalies, volume capacity violations, and engine stop failures.

---

## 2. Custom Report Builder

For specialized audits, the Report Builder allows users to construct custom data extracts:
* **Filters:** Date ranges, provider selection (`DKV` or `AS24`), registration list, station codes, product categories, reconciliation status filters, and telematics confidence limits.
* **Grouping Dimensions:** Summarize data by vehicle, driver, card, station, or country.
* **Aggregations:** Calculate average unit price, total volume, total VAT, and net variances.

---

## 3. View Selectors

The user interface provides six interactive layout view selectors to tailor the display:

1. **Executive View:** Simplified dashboard showing KPI cards, chart widgets, and status summaries.
2. **Exceptions View:** Filtered list displaying only mismatched records that require action.
3. **Full Detail View:** Spreadsheet-style grid showing all transactions and invoice rows side-by-side.
4. **Summary View:** Grouped accordion display showing totals by card or vehicle registration.
5. **Evidence View:** A side-by-side split screen showing an invoice transaction next to its matching GPS logs.
6. **Sign-Off View:** A validation interface where authorized auditors approve a reconciliation run, generating a digital sign-off signature and locking the period.

---

## 4. Export Formats & Formula Injection Prevention

Reports can be exported in four formats: **CSV**, **Excel (XLSX)**, **PDF**, and **HTML**.

### Formula Injection Vulnerability (CSV Injection)
When exporting text fields (such as vehicle registration plates, station names, or operator notes) to CSV or Excel, malicious or malformed inputs can compromise client systems. If an operator names a yard pump `=SUM(1+2)` or a registration plate is set to `=cmd|' /C calc'!A0`, Excel may execute these formulas when the CSV is opened:

$$\text{Raw Cell Value: } \texttt{"=SUM(A1:A10)"} \quad \rightarrow \quad \text{Excel action: executes formula}$$

### Prevention Rules
To prevent formula injection, the export engine filters all text fields prior to writing Excel or CSV cells:
* Checks the starting character of every string.
* If a string starts with any of the following characters:
  * `=` (Equals)
  * `+` (Plus)
  * `-` (Minus)
  * `@` (At symbol)
  * `\t` (Tab)
  * `\r` (Carriage return)
* The exporter prefixes the string with a single quote (`'`). Excel interprets this prefix as a text-formatting instruction, rendering the formula as plain text and preventing execution:

$$\text{Sanitised Value: } \texttt{"'=SUM(A1:A10)"} \quad \rightarrow \quad \text{Excel action: displays text string}$$
This sanitization is applied to all string cell writes, ensuring safe exports even if source files contain malicious strings.
