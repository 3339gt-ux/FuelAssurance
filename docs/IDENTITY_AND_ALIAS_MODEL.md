# Identity & Alias Model

In fleet operations, hardware and identifiers are not static. Vehicles are bought and sold, registration numbers are changed (e.g., re-registering an imported vehicle), fuel cards are reassigned, and on-board units (OBUs) are swapped between trucks. 

To prevent historical audit trails from breaking when these assets are updated, the Fuel Assurance system uses a **Stable Identity & Effective-Dated Alias Model**.

---

## 1. The Core Identity Problem

In a naive database model, transactions are linked directly to text values (like registration plates or card numbers). However, this introduces major issues:
* **Historical Inflation:** If vehicle registration `241MH100` is re-registered as `241MH500` in June, running a reconciliation report in December for the month of April will fail to find `241MH100` if the record was updated in-place.
* **Double Counts:** If a fuel card is moved from Truck A to Truck B, simply querying the card number will attribute historical fuel usage to the wrong truck.
* **Operator Delays:** Standard interfaces crash if an imported transaction contains an unknown registration or card.

The Fuel Assurance system resolves this by mapping all transactions to **Stable Internal IDs** representing the physical asset, using **Effective-Dated Aliases** to resolve historical values.

---

## 2. Vehicle Identity & Registration Aliases

A physical vehicle is represented by a stable, system-generated UUID (`id`) that remains unchanged throughout the vehicle's lifecycle.

```
┌─────────────────────────────────────────────────────────────┐
│                       Vehicle Entity                        │
│                     (Stable UUID: 9ab2...)                  │
├──────────────────────────────┬──────────────────────────────┤
│ Primary Registration         │ 241MH236                     │
├──────────────────────────────┴──────────────────────────────┤
│ Aliases Array                                               │
├─────────────────────────────────────────────────────────────┤
│ 1. Reg:  252MH101                                           │
│    Dates: 2026-01-01 to 2026-06-01 (Reason: Temporary Import)│
├─────────────────────────────────────────────────────────────┤
│ 2. Reg:  UK-77XYZ                                           │
│    Dates: 2025-01-01 to 2025-12-31 (Reason: Original Plate) │
└─────────────────────────────────────────────────────────────┘
```

### The Vehicle Model
The `Vehicle` interface (`src/domain/identities/vehicle-identity.ts`) consists of:
* `id`: A stable UUID.
* `primaryRegistration`: The current official registration plate.
* `aliases`: An array of `VehicleAlias` records.
* `createdAt` & `updatedAt` timestamps.

### The VehicleAlias Model
Each alias represents a registration plate that the vehicle held during a specific time interval:
* `registration`: The alias registration plate.
* `effectiveFrom`: The ISO date when the alias became active.
* `effectiveTo`: The ISO date when the alias became inactive (null if still active).
* `reason`: Text context (e.g. `"Temporary Import"`, `"Original UK registration"`).

### Resolution Logic (`resolveVehicle`)
When a transaction is normalising, the system resolves the registration using date awareness:
1. Cleans the incoming registration string (converts to uppercase and removes spaces/hyphens).
2. Checks all primary vehicle registrations. If an exact match is found, it resolves to that vehicle.
3. If no primary match is found, it scans all aliases.
4. Checks if the transaction date falls within the alias's active interval:
   $$\text{effectiveFrom} \le \text{transactionDate} \le \text{effectiveTo}$$
5. If a match is found, it resolves to the primary vehicle record.

This ensures that a transaction from 2025 using plate `UK-77XYZ` is correctly mapped to the same physical vehicle record that now uses plate `241MH236`.

---

## 3. Card & OBU Identity Aliases

Similar to vehicles, fuel cards and OBUs (On-Board Units) are assigned stable system IDs.

### The Card Model
The `Card` interface (`src/domain/identities/card-identity.ts`) contains:
* `id`: Stable system UUID.
* `rawNumber`: The physical number printed on the card.
* `normalisedCore`: Space-stripped number used for database indexing.
* `provider`: Card issuer (`DKV` or `AS24`).
* `equipmentNumber`: Hardware identifier associated with the card (such as a toll box ID).
* `aliases`: Array of `CardAlias` records.

### Resolution Logic (`resolveCard`)
1. Normalises the input card number by stripping whitespace.
2. Checks direct matches on `normalisedCore` or `equipmentNumber`.
3. If no direct match is found, it scans the card alias array.
4. If the transaction date falls within the alias interval, it resolves the card:
   $$\text{effectiveFrom} \le \text{transactionDate} \le \text{effectiveTo}$$

This handles card reassignment. If Card 55001 is reassigned from Driver A to Driver B, the card alias records the exact dates of the transfer. Historical transactions are attributed to Driver A, while new transactions are attributed to Driver B.

---

## 4. Unknown-Data Mapping Queue

When a file import contains registrations or card numbers that do not match any record in the database, the system does not fail. Instead, it places the unmapped records in the **Identity Mapping Queue**.

```
                           Import File Ingestion
                                     │
                     Is registration/card recognized?
                                     │
                   ┌─────────────────┴─────────────────┐
                   ▼ Yes                               ▼ No
           Process Normally                      Route to Queue
                                                       │
                                                       ▼
                                             Operator Manual Action
                                         ┌─────────────┴─────────────┐
                                         ▼                           ▼
                                  Assign as Alias             Create New Asset
                                   (Date Bound)
```

### How the Queue Works
1. **Import Isolation:** The row is saved in the database but flagged with an `unmapped_identity` error. The import transaction itself is placed in a `PENDING_MAPPING` state.
2. **The Queue Dashboard:** Operators see a clean interface showing all unmapped registrations and card numbers, their source file names, dates, and frequency of occurrence.
3. **Manual Resolution Options:**
   * **Assign as Alias:** The operator can link the unknown registration to an existing vehicle. They specify the effective date range. (For example, mapping temporary plate `TEMP-99` to Vehicle `V-102` for the week of April 5th).
   * **Create New Asset:** The operator can register the unknown registration as a brand-new vehicle.
4. **Trigger Reprocessing:** Once resolved, the system runs the reconciliation engine in the background to update the status of the pending rows.
