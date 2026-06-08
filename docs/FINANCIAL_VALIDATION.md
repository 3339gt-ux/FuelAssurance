# Financial Validation Specification

The Financial Validation Engine (`src/domain/financial/financial-validator.ts`) validates the monetary details of every invoice line. It ensures that prices, fees, VAT, and discounts charged by fuel card providers align with mathematical formulas and contracted rates, using high-precision decimal arithmetic.

---

## 1. Decimal.js Arithmetic (Floating-Point Safety)

The system uses **Decimal.js** for all financial and quantity calculations, avoiding standard JavaScript floating-point arithmetic.

```
                  Raw Invoice / Transaction Fields
                                 │
                   (Represented as string text)
                                 │
                                 ▼
                     Instantiation via d(val)
                     (new Decimal(val || 0))
                                 │
                                 ▼
                    Execution of Math Operations
                 (mul(), plus(), minus(), div())
                                 │
                                 ▼
                    Precision String Serialization
                         (toFixed(4) output)
```

In standard JavaScript:
```javascript
0.1 + 0.2 === 0.30000000000000004
```
In commercial transactions with high fuel volumes, these rounding errors accumulate:
* An error of `0.0001` per unit, multiplied by a monthly invoice of `500,000` litres, leads to reconciliation errors.
* The system reads all spreadsheet numeric cells as strings and initializes them:
  ```typescript
  import Decimal from 'decimal.js';
  const val = new Decimal(stringValue || '0');
  ```
* All comparisons use Decimal methods (`plus`, `minus`, `mul`, `div`, `abs`, `lte`) rather than standard equality operators.

---

## 2. Validation Fields & Mathematical Formulas

For every canonical invoice row, the engine validates six financial relationships:

### I. Quantity × Unit Price (Net Base Value)
Validates that the net base value matches the purchased quantity multiplied by the net price per unit:
$$\text{Expected Base Net} = \text{Quantity} \times \text{Price Per Unit}$$
$$\text{Variance} = \left| \text{Billed Base Net} - \text{Expected Base Net} \right|$$

### II. Net Base Value + VAT (Gross Base Value)
Validates tax calculations:
$$\text{Expected Base Gross} = \text{Base Value Net} + \text{VAT}$$
$$\text{Variance} = \left| \text{Billed Base Gross} - \text{Expected Base Gross} \right|$$

### III. Net Base Value + Service Fee - Discount (Purchase Net Value)
Validates that the net purchase value correctly incorporates net base values, service fees, and discounts:
$$\text{Expected Purchase Net} = \text{Base Value Net} + \text{Service Fee Net} - \left| \text{Discount Net} \right|$$
$$\text{Variance} = \left| \text{Value of Purchase Net} - \text{Expected Purchase Net} \right|$$

### IV. Gross Unit Price Consistency
Validates that the gross price per unit matches the net price plus the allocated tax per unit:
$$\text{Expected Price Per Unit Gross} = \text{Price Per Unit} + \left( \frac{\text{VAT}}{\text{Quantity}} \right)$$
$$\text{Variance} = \left| \text{Price Per Unit Gross} - \text{Expected Price Per Unit Gross} \right|$$

### V. Approved Station Price Validation
If the station master records a price for the station code and date, the engine validates the billed unit price against the approved rate:
$$\text{Expected Price} = \text{Station Master Net Cost Per Litre}$$
$$\text{Variance} = \left| \text{Billed Price Per Unit} - \text{Expected Price} \right|$$

### VI. Expected Discount Validation
Validates that the contracted rebate is applied correctly based on the station master rate:
$$\text{Expected Discount} = \text{Quantity} \times \text{Station Master Discount Rate}$$
$$\text{Variance} = \left| \left| \text{Billed Discount Net} \right| - \text{Expected Discount} \right|$$

---

## 3. Tolerance Configuration & Application

Because of minor rounding differences in provider billing systems, the engine applies configurable percentage tolerances:

* **`quantityPriceTolerancePercent`** (Default: **0.5%**): Applied to quantity-price multiplications.
* **`vatTolerancePercent`** (Default: **1.0%**): Applied to VAT calculations.
* **`feeTolerancePercent`** (Default: **2.0%**): Applied to service fees.
* **`discountTolerancePercent`** (Default: **1.0%**): Applied to rebates.
* **`currencyConversionTolerancePercent`** (Default: **2.0%**): Applied to currency conversions.
* **`roundingToleranceAbsolute`** (Default: **0.02 EUR**): Absolute rounding variance limit.

### Tolerance Evaluation Logic
For each check, the maximum allowable variance is calculated as:
$$\text{Max Variance} = \max\left( \text{Rounding Tolerance Absolute}, \, \text{Expected Value} \times \frac{\text{Tolerance Percent}}{100} \right)$$
The field is marked as valid if the difference is within this limit:
$$\text{Variance} \le \text{Max Variance}$$

If the difference exceeds this value, it is flagged as a financial variance.

---

## 4. Negative Value Handling

Provider invoices represent discounts and rebates differently. For example, DKV transaction rows record discounts as negative numbers (e.g., `-10.50` or `-0.0200` per litre), whereas AS24 files format rebates as positive values within a dedicated rebate column.

To prevent sign mismatches:
* The validation engine applies absolute value conversion (`.abs()`) to all discounts and rebates prior to evaluation:
  ```typescript
  const discountNet = d(row.discountNet).abs();
  const expectedDiscount = qty.mul(d(stationPrice.discount)).abs();
  ```
* Billed base net and gross totals are also verified as absolute values to accommodate return credits or billing corrections without triggering false alarms.
* The system maps negative invoice rows (credit notes) using the same validation equations, ensuring that return amounts match original purchases.
