# Reasoning Ledger Specification

The **Reasoning Ledger** (`src/domain/reasoning/reasoning-ledger.ts`) is the system's audit trail. It records every mathematical check, telematics scoring deduction, and matching factor evaluated during the reconciliation process. This guarantees complete transparency, allowing operators and auditors to inspect how a status was determined.

---

## 1. Architectural Role of the Ledger

In traditional database designs, the system only stores the final status (e.g., `RECONCILED` or `VARIANCE`). When an auditor asks why a transaction was flagged, the underlying reason is often lost.

The Fuel Assurance system resolves this by keeping the machine's reasoning decoupled from state updates:

```
┌─────────────────────────────────────────────────────────────┐
│                      Reasoning Ledger                       │
├─────────────────────────────────────────────────────────────┤
│ Machine Result                                              │
│ (Immutable, showing exact scores and factor calculations)    │
├─────────────────────────────────────────────────────────────┤
│ Supporting & Contradictory Evidence Arrays                  │
│ (Source file references, raw values, and log timestamps)    │
├─────────────────────────────────────────────────────────────┤
│ Configuration & Rule Set Version Snapshots                  │
│ (Allows complete reconstruction of the results)            │
├─────────────────────────────────────────────────────────────┤
│ Manual Override Decision (Null if untouched)                │
│ (Preserves machine calculations while recording override)    │
└─────────────────────────────────────────────────────────────┘
```

The reasoning ledger is stored in the database. If an operator overrides a machine result (e.g., approving an invoice line that failed the location proximity check), the ledger records the operator's decision and reasoning **without altering the machine's calculations**.

---

## 2. Factor Table Schema & Columns

Each ledger entry contains an array of `ReasoningFactor` records. This data is displayed in the UI as a calculation details table.

| Schema Property | Data Type | Description |
| :--- | :--- | :--- |
| `factorName` | String | The name of the validation or scoring rule (e.g., `Base Value Net`, `Time Proximity`). |
| `sourceValue` | String | The raw value extracted from the file (e.g., `"585.51"`, `"2026-06-08T14:22:00Z"`). |
| `normalisedValue` | String | The expected value calculated by the engine (e.g., `"585.50"`). |
| `rule` | String | The formula description (e.g., `"Quantity × Price per unit"`, `"GPS Time Window"`). |
| `maxPoints` | Number | Maximum points allocated to this rule (e.g., `25`, `10`). |
| `awardedPoints` | Number | Points awarded by the calculation engine (e.g., `17`, `0`). |
| `result` | Enum | The result of the evaluation: `PASS`, `PARTIAL`, `FAIL`, `SKIP`, or `N_A`. |
| `explanation` | String | Human-readable explanation (e.g., `"Base Value Net differs by 0.01 — within tolerance of 0.02."`). |

---

## 3. Evidence Categories

To support automated findings, the ledger categorizes evidence into three arrays:

1. **Supporting Evidence (`supportingEvidence`):** Confirming logs (e.g., a GPS ping showing the vehicle stopped at the station within 5 minutes of the transaction).
2. **Contradictory Evidence (`contradictoryEvidence`):** Conflicting records (e.g., the transaction was billed for Diesel, but the vehicle's FMS sensor reported AdBlue usage, or the GPS log recorded the vehicle 150 km away).
3. **Missing Evidence (`missingEvidence`):** Missing information (e.g., the fuel card transaction reported a vehicle odometer value of `0` or blank, or the vehicle was not equipped with a fuel level sensor).

### Evidence Item Schema
Each item in these arrays is structured as an `EvidenceItem`:
* `source`: Source identifier (e.g., `GPS_LOG`, `DKV_TRANSACTION`).
* `description`: Descriptive explanation.
* `value`: The raw values evaluated.
* `weight`: Relational weight (used to sort evidence priority in the UI).
* `timestamp`: ISO timestamp of the evidence event.

---

## 4. Rule-Set Versioning & Reproducibility

Over time, fleet operators may modify matching tolerances, adjust scoring weights, or alter capacities. If these values were read dynamically from a global settings table, historical ledger entries would change when re-evaluated.

To ensure reproducibility:
* **Rule-Set Snapshot:** Every ledger entry includes a snapshot of the active ruleset version (`RuleSetVersion`).
* **Active Weights:** The ruleset records the exact weights (e.g., Time 25, Location 25, Fuel 25) and configurations (tolerances, tank capacities) used during the run.
* **Audit Value:** Because this configuration is frozen within the ledger entry, auditors can rerun the math at any time and get the exact same results.

---

## 5. Manual Override Preservation Model

If an operator resolves a variance by manually overriding the status, the system executes an append-only update:
1. The machine's `MachineResult` block is **never modified or deleted**.
2. A `ReviewDecision` block is populated:
   * `decidedBy`: User ID of the reviewer.
   * `decidedAt`: Timestamp of the override.
   * `decision`: The action taken (`APPROVE`, `REJECT`, `OVERRIDE`).
   * `overrideStatus`: The target status (e.g., `EXACT_MATCH`).
   * `reason`: Operator reasoning for the override.
   * `preserveMachineResult`: Explicitly set to `true`.
3. In the UI, the record is marked as overridden, displaying a badge alongside the audit notes, while preserving the original scoring results.

---

## 6. "How Was This Calculated?" UI Specification

The ledger provides the data schema for the interactive **"How was this calculated?"** audit panel in the frontend:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Audit Panel: Transaction DKV-90812                                   │
├────────────────────────────────────────────────────────────────────────┤
│  OVERRIDE: Approved by auditor Jane Smith (2026-06-08)                 │
│  Reason: "Sensor calibration issue on Truck 12. Verified manually."   │
├────────────────────────────────────────────────────────────────────────┤
│  Machine Confidence Score: 68% (REVIEW status)                         │
├────────────────────────────────────────────────────────────────────────┤
│  Calculation Details:                                                  │
│  ✔ Time Proximity: PASS (Nearest GPS point is 4min away)  [+25 pts]    │
│  ✘ Fuel Movement: FAIL (No fuel level increase detected)   [+0 pts]     │
│  ✔ Engine Stop: PASS (Vehicle stationary during window)    [+10 pts]    │
│  ✔ Location Proximity: PASS (Text match 100% on city)      [+25 pts]    │
│  ⚠ Odometer Match: PARTIAL (Discrepancy of 520 km)         [+1.5 pts]   │
└────────────────────────────────────────────────────────────────────────┘
```

* **Calculation Steps:** The panel lists every factor from the ledger table, displaying a pass/fail indicator, the points awarded, and a detailed explanation.
* **Evidence Toggle:** A side-by-side view displays supporting and contradictory evidence, allowing auditors to inspect the matching raw data records.
* **Export Auditing:** The panel supports exporting the full calculation trail as a PDF report for compliance reviews.
