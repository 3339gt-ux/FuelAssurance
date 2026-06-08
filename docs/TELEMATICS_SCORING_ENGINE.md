# Telematics Scoring Engine

The Telematics Scoring Engine (`src/domain/telematics/telematics-scorer.ts`) cross-references fuel card transactions with vehicle GPS telemetry records to verify that a billed transaction corresponds to a physical event. By scoring multiple telemetry dimensions, the engine flags suspicious transactions and validates legitimate fleet fuel usage.

---

## 1. Multi-Factor Scoring Architecture

The engine computes a deterministic confidence score (normalized to a range of 0 to 100) based on six weighted dimensions:

```
                          Raw Fuel Transaction
                                   │
                    Retrieve GPS Telemetry Records
                                   │
                      Is GPS data found?
                                   │
                   ┌───────────────┴───────────────┐
                   ▼ Yes                           ▼ No
       Assess 6 Scoring Dimensions       INSUFFICIENT_EVIDENCE
     (Skip inapplicable dimensions)
                   │
                   ▼
         Sum Awarded Points
     ────────────────────────── × 100
     Sum Max Possible Points
                   │
                   ▼
        Assign Classification
   (VERIFIED, LIKELY, REVIEW, UNLIKELY)
```

| Dimension | Maximum Points | Verification Check |
| :--- | :--- | :--- |
| **Time Proximity** | 25 | Time offset between transaction and nearest GPS record. |
| **Location Proximity** | 25 | Text overlap between station metadata and GPS location fields. |
| **Fuel Level Movement** | 25 | Verification of fuel level increase matching fuel volume. |
| **Stop/Engine Behaviour** | 10 | Verification that vehicle was stationary during transaction. |
| **Volume Consistency** | 10 | Comparison of fuel quantity against vehicle tank capacity. |
| **Odometer Consistency** | 5 | Comparison of odometer readings. |
| **Total Possible** | **100** | |

---

## 2. Confidence Classifications

Based on the final normalized score and the availability of data, transactions are assigned one of five classifications:

* **`VERIFIED` (Score $\ge$ 85):** High confidence that the transaction is legitimate. All critical dimensions (time, location, fuel increase, stop) passed.
* **`LIKELY` (Score 70 to 84):** Medium confidence. Most checks passed, with minor variances in timing or partial location matching.
* **`REVIEW` (Score 45 to 69):** Low confidence. Significant discrepancies detected (e.g., location match failed, or fuel level did not increase). Routed to review queue.
* **`UNLIKELY` (Score 0 to 44):** High risk. The vehicle was not in the area, was driving at high speed, or fuel levels continued to drop. Flagged for fraud audit.
* **`INSUFFICIENT_EVIDENCE`:** Telematics data was missing or too sparse (skipped dimensions account for $>50\%$ of total weights).

---

## 3. Dimensional Scoring Rules

### I. Time Proximity (25 Points)
Measures the absolute time difference between the transaction timestamp and the closest recorded GPS point:
* **$\le$ 15 minutes:** Full points (**25 pts**, `PASS`).
* **16 to 60 minutes:** Partial points (**17 pts**, `PARTIAL`).
* **61 to 120 minutes:** Low partial points (**8 pts**, `PARTIAL`).
* **$> 120$ minutes:** Failure (**0 pts**, `FAIL`).

### II. Location Proximity (25 Points)
Because the current GPS tracking logs contain address text but no latitude/longitude coordinates, this check uses a text-matching algorithm against address and city strings:
* **City & Country Match:** If the GPS location string contains the transaction station city and country, the matching score increases.
* **Station Name Match:** If the station brand matches words in the GPS position address, additional points are awarded.
* **Scoring Multiplier:** Points are awarded based on a matched text ratio:
  $$\text{Awarded Points} = \text{Round}(25 \times \text{Matched Ratio})$$
* **Result Classification:** $\ge 70\%$ match is a `PASS`, $\ge 30\%$ is a `PARTIAL`, otherwise `FAIL`.

### III. Fuel Level Movement (25 Points)
Validates that the vehicle's CAN-bus fuel sensor recorded an increase around the transaction time:
* **Requirements:** Requires at least one GPS reading before and one reading after the transaction timestamp within the 120-minute window.
* **Fuel Increase Calculation:**
  $$\text{Increase} = \text{Fuel After} - \text{Fuel Before}$$
* **Scoring Rules:**
  * **Increase $> 3.0\%$:** Full points (**25 pts**, `PASS`).
  * **Increase $> 0.0\%$:** Partial points (**15 pts**, `PARTIAL`).
  * **Fuel After $\ge 95\%$:** If the tank was filled to capacity, the sensor may cap at 100%, hiding the true increase (**12.5 pts**, `PARTIAL`).
  * **Increase $\le 0.0\%$:** Tank level decreased or remained unchanged (**2.5 pts**, `FAIL`).

### IV. Stop / Engine Behaviour (10 Points)
Confirms that the truck engine was stopped or stationary during refueling to prevent "mobile refueling" fraud:
* **Stationary Check:** Looks for GPS records showing speed $\le 1$ km/h, or activities matching `Standstill`, `Rest`, or `Stop`.
* **Scoring Rules:**
  * **$\ge$ 2 stationary points:** Full points (**10 pts**, `PASS`).
  * **1 stationary point:** Partial points (**7 pts**, `PARTIAL`).
  * **0 stationary points:** Vehicle was moving (**0 pts**, `FAIL`).

### V. Volume Consistency (10 Points)
Checks that the quantity of fuel billed does not exceed the vehicle's physical tank capacity:
* **Standard Capacity:** Defaults to a standard **1,200 Litre** capacity (typical for commercial tractor units).
* **Scoring Rules:**
  * **Quantity $\le$ 1,200 Litres:** Full points (**10 pts**, `PASS`).
  * **Quantity $> 1,200$ Litres:** Indicates fuel was pumped into unauthorized containers or another vehicle (**0 pts**, `FAIL`).

### VI. Odometer Consistency (5 Points)
Compares the mileage recorded at the pump with the odometer reading logged by GPS:
* **Scoring Rules:**
  * **Odometer Difference $< 500$ km:** Full points (**5 pts**, `PASS`).
  * **Odometer Difference $\ge$ 500 km:** Partial points (**1.5 pts**, `PARTIAL`).
* **Interpretation:** Odometers can fall out of sync due to manual entry errors at the pump. A mismatch is treated as a data quality warning, not an indication of fraud.

---

## 4. Product-Specific Rules & Exclusions

Not all transactions represent fuel pumped into a vehicle's primary tank. The engine applies product-specific rules to prevent false alerts:

1. **Non-Fuel Products (Tolls, Parking, Washing, Fees):**
   * Excluded from Fuel Level, Volume, and Stop checks.
   * These dimensions are marked as `SKIP` (removed from denominator). The total score is computed using only Time, Location, and Odometer dimensions.
2. **AdBlue Purchases:**
   * Excluded from Fuel Level checks. AdBlue is stored in a separate tank and does not trigger the primary diesel fuel level sensor.
   * Marked as `SKIP` for fuel level calculations.
3. **GNR (Gasoil Non-Routier / Red Diesel for Refrigeration Units):**
   * Refrigeration units draw fuel from a secondary tank, which may not be monitored by the primary vehicle telematics.
   * The engine evaluates GNR volume against a smaller **200 Litre** auxiliary tank capacity.
   * If fuel sensor readings are unavailable for the auxiliary tank, the Fuel Level dimension is skipped.
