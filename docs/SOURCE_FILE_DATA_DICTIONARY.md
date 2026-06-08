# Source File Data Dictionary

This document provides a field-by-field schema reference of all raw files processed by the Fuel Assurance system. It details the exact column names (including typographical errors observed in production), data types, sample values, and parsing quirks for DKV, AS24, GPS, and Station Master files.

---

## 1. DKV Transaction ("Ola Report" - Excel .xlsx)

This file contains pre-authorisation or real-time transaction records from DKV. It is imported in two variants: Variant 1 (12 columns) and Variant 2 (21 columns). The system automatically detects the variant based on the column count.

### Schema Fields

| Column Index | Field / Header Name | Data Type | Sample Value | Description & Quirks |
| :--- | :--- | :--- | :--- | :--- |
| 0 | `Licence plate` | String | `241MH241` | Vehicle registration plate. Cleaned to remove whitespace. |
| 1 | `Authorization Time` | Number | `46180.53125` | Excel serial datetime representing when transaction was authorized. |
| 2 | `Sales` | Number | `450.50` | Quantity purchased (usually litres for fuel). |
| 3 | `Cost group` | String | `Fuel` | DKV cost categorization. |
| 4 | `Product group` | String | `Diesel` | Category of product purchased. |
| 5 | `Product` | String | `DKV DIESEL` | User-friendly product name. |
| 6 | `Product code` | String | `WA0009` | DKV internal product code. `WA0009` represents Diesel, `WA0016` represents AdBlue. |
| 7 | `Authorization Amount Gross` | Number | `720.80` | Gross cost including VAT at pre-authorisation stage. |
| 8 | `Service country` | String | `IRL` | Three-letter ISO country code where transaction took place. |
| 9 | `Mileage` | Number | `340120` | Vehicle odometer reading at pump. |
| 10 | `Number of card or box` | String | `782400123456` | Card number or OBU hardware identifier. Leading zeroes preserved. |
| 11 | `Response` | String | `APP` | Authorization response code. `APP` or `APPROVED` represent success. |
| 12 (V2) | `Customer ID` | String | `123456` | Fleet operator account identifier. |
| 13 (V2) | `Cost center` | String | `DUBLIN_LOG` | Internal customer billing cost centre code. |
| 14 (V2) | `Card addition` | String | `01` | Card index number suffix. |
| 15 (V2) | `Station number` | String | `SS450123` | Pump station identifier. Often prefixed with `SS`. |
| 16 (V2) | `Station name` | String | `DKV Station Dublin` | Name of station. |
| 17 (V2) | `Town` | String | `Dublin` | City/Area where station is located. |
| 18 (V2) | `Station category` | String | `Low Price` | Station tier category. |
| 19 (V2) | `Unit` | String | `L` | Unit of measure (`L` for Litres, `ST` for Pieces). |
| 20 (V2) | `Authorization ID` | String | `895012345` | Unique DKV authorization ID. Maps to invoice transaction number. |

---

## 2. DKV Invoice ("Invoice-Transactions" - Excel .xlsx)

This file contains the final billing lines issued by DKV. It contains 40 columns of details detailing base net/gross, service currencies, VAT percentages, and discounts.

### Schema Fields

| Field Name (Canonical Mapping) | Source Column Header | Data Type | Sample Value | Description & Quirks |
| :--- | :--- | :--- | :--- | :--- |
| `transactionTime` | `Transaction time` | Number | `46182.6101` | Excel serial date/time of transaction. |
| `stationName` | `Station name` | String | `Dublin Port Pump` | Brand/Name of service station. |
| `stationCity` | `Station city` | String | `Dublin` | City location of pump. |
| `stationNumber` | `Station number` | String | `SS091234` | DKV internal station code (needs prefix strip). |
| `transactionNumber` | `Transaction number` | String | `895012345` | Invoice transaction identifier. Maps to authorisation ID. |
| `serviceCountry` | `Service country` | String | `IRL` | Service country ISO code. |
| `costGroup` | `Cost group` | String | `Fuel` | DKV cost group. |
| `productGroup` | `Product group` | String | `Diesel` | DKV product group. |
| `product` | `Product` | String | `DKV DIESEL` | Specific product name. |
| `productCode` | `Product code` | String | `WA0009` | Product code (e.g. `WA0009`). |
| `paymentCurrency` | `Payment currency` | String | `EUR` | Currency customer pays in. |
| `unit` | `Unit` | String | `L` | Unit of quantity (e.g. `L`). |
| `quantity` | `Quantity` | Number | `520.45` | Litres/Units charged. |
| `pricePerUnit` | `Price per unit` | Number | `1.1250` | Contracted unit price (excluding VAT). |
| `baseValueNet` | `Base Value Net` | Number | `585.51` | `Quantity` × `Price per unit` before fees. |
| `serviceFeeNet` | `Service fee net` | Number | `5.86` | Net service fee charged by provider. |
| `valueOfPurchaseNet` | `Value of purchase net` | Number | `591.37` | Base net plus fees minus discounts. |
| `serviceCurrency` | `Service currency` | String | `EUR` | Currency of service country. |
| `valueInPayCurrency` | `Value in pay currency` | Number | `709.62` | Gross amount to pay in invoicing currency. |
| `valueInServiceCountryCurrency` | `Value in currency of service country` | Number | `709.62` | Gross amount in local currency. |
| `vat` | `VAT` | Number | `118.25` | VAT amount charged on base net. |
| `pricePerUnitGross` | `Price per unit gross` | Number | `1.3620` | Unit price including VAT. |
| `discountNet` | `Discount net` | Number | `-10.50` | Contracted rebate/discount applied. (Usually negative). |
| `licencePlate` | `Licence plate` | String | `241MH241` | Registration assigned to card during purchase. |
| `cardBoxNo` | `Card/Box No.` | String | `782400123456` | Card number billed. |
| `cardBoxNoPartner` | `Card/Box No. (Partner)` | String | `98240012` | Partner network card code. |
| `invoiceDate` | `Invoice date` | Number | `46190` | Excel serial date of invoice issuance. |
| `documentNumber` | `Document number` | String | `INV901234` | Unique invoice PDF document ID. |
| `invoiceNumber` | `Invoice number` | String | `RE-12345` | Global DKV invoice record identifier. |
| `ticketNumberDKV` | `Ticket Number DKV` | String | `T90123` | Pump-issued paper ticket reference. |
| `stationZipCode` | `Station zip code` | String | `D01 A234` | Station post code. |
| `baseValueGross` | `Base Value Gross` | Number | `703.76` | Base net value + VAT. |
| `costCentre1` | `Cost center 1` | String | `DEPOT_EAST` | Primary cost division. |
| `costCentre2` | `Cost center 2` | String | `FLEET_MGMT` | Secondary cost division. |
| `invoiceCountry` | `Invoice country` | String | `DEU` | Invoicing entity country ISO code. |
| `mileage` | `Mileage` | Number | `340150` | Odometer reading. |
| `discountGross` | `Discount gross` | Number | `-12.71` | Gross rebate amount. |
| `agesTerminal` | `Ages terminal` | String | `AGES01` | Toll terminal identification. |
| `customerId` | `Customer ID` | String | `123456` | Fleet account code. |
| `equipmentNumber` | `Equipment number` | String | `OBU-90123` | OBU equipment identifier, if applicable. |

---

## 3. GPS / Telematics Logs (Excel .xls)

This workbook lists telemetry points recorded by the fleet's GPS tracking provider.

### Schema Fields

| Column Index | Field / Header Name | Data Type | Sample Value | Description & Quirks |
| :--- | :--- | :--- | :--- | :--- |
| 0 | `Vehicle` | String | `241MH241` | Vehicle registration plate matching database records. |
| 1 | `Trailer` | String | `T-908` | Registration plate of attached trailer (if any). |
| 2 | `Created date` | Number | `46180.5315` | Excel serial datetime indicating when record was stored. |
| 3 | `Data source` | String | `FMS` | Ingest channel (`FMS` CAN-bus, `GPS` satellite, etc.). |
| 4 | `Fuel level` | String | `68.5` | Fuel tank level as percentage (0-100). Parsed as Float. |
| 5 | `KM` | String | `340121.2` | Vehicle odometer reading in kilometers. |
| 6 | `Speed` | String | `0.0` | Vehicle speed in km/h. Parsed as Float. |
| 7 | `Driver` | String | `John Doe` | Name of logged driver. |
| 8 | `Activity / Registration` | String | `Standstill` | Vehicle state (`Driving`, `Standstill`, `Ignition Off`, `Rest`). |
| 9 | `Info` | String | `Engine stop` | Extra state details. |
| 10 | `Position from city` | String | `Dublin` | Nearest city. |
| 11 | `Position from town` | String | `Dublin Port` | Nearest town area. |
| 12 | `Position from street` | String | `Alexandria Road` | Street address. |
| 13 | `Position from village` | String | `` | Nearest village. |
| 14 | `Position from address` | String | `Dublin Port POI` | Resolved Point of Interest or geofence name. |

> [!WARNING]
> The GPS logs contain **no coordinates** (latitude/longitude columns are completely empty or missing). All location proximity calculations must rely strictly on text-based matching against the position address strings.

---

## 4. Approved Stations Workbook (Excel .xlsx)

This workbook contains agreed network prices and discounts. It is structured into three sheets, each with its own column patterns and quirks:

### Sheet 1: `Yard, DKV Prices`
This sheet lists yard pumps and partner DKV stations.
* **Typographical Errors:** The column headers for coordinates are misspelled as `LATTITUDE` and `LONGTITUDE`.
* **Country Inheritance:** The `Country` column is only populated on the first row of a country section. Subsequent rows have empty country cells and must inherit their country value from the nearest preceding populated row.

| Header Name | Data Type | Sample Value | Description |
| :--- | :--- | :--- | :--- |
| `Country` | String | `Ireland` | Station country. Empty cells inherit from preceding rows. |
| `PUMP` | String | `Dublin Yard` | Brand or yard description. |
| `CODE (DKV APP)` | String | `SS091234` | Fuel card station code. Strip `SS` prefix to normalise. |
| `CITY / AREA` | String | `Dublin Port` | Town location. |
| `↓ CLICK FOR LOCATION ↓` | String | `https://maps.google.com/?q=...` | Hyperlink URL to station location. |
| `ADDRESS` | String | `Terminal 1 Road` | Street address. |
| `POST CODE` | String | `D01 A234` | Zip/Post code. |
| `LATTITUDE` | String | `53.3498` | GPS Latitude (misspelled). Replace comma with dot. |
| `LONGTITUDE` | String | `-6.2603` | GPS Longitude (misspelled). Replace comma with dot. |
| `COST` | String | `1.0850` | Contracted net cost per litre. |
| `SERVICE FEE 1%` | String | `0.01` | Service fee multiplier (e.g. `0.01` represents 1%). |
| `DISCOUNT` | String | `0.0200` | Agreed discount per litre. |
| `EXCISE DUTY REBATE` | String | `0.0000` | Reclaimable tax discount. |

### Sheets 2 & 3: `Red Diesel (Fridge) Prices (AS24)` & `Diesel Prices (AS24)`
These sheets list AS24 station pricing.
* **Quirks:** AS24 does not provide coordinates in this workbook. Address contains city information.

| Header Name | Data Type | Sample Value | Description |
| :--- | :--- | :--- | :--- |
| `Full Country Name` | String | `BELGIUM` | Station country. |
| `Address` | String | `Gent Port` | Location area (acts as City). |
| `Product` | String | `GNR` / `DIESEL` | Product type description. |
| `AS24 Station Code` | String | `0045` | Code matching AS24 invoice records. |
| `Station Name` | String | `GENT PORT PUMP` | Station name description. |
| `Postcode` | String | `9000` | Zip/Post code. |
| `Date of Application` | Number / Date | `46185` / `2026-06-01` | Date price becomes effective. |
| `Net Cost (EUR/L)` | Number | `1.0921` | Base net cost per litre. |

---

## 5. AS24 PDF Invoice Statements

The AS24 parser extracts structured data from native PDF text representations by identifying three sections:

### I. Invoice Statement (Summary Block)
Contains total amounts and control summaries.
* **Fields:** `Invoice Number` (Num. :), `Invoice Date` (Date :), `Customer number :`, `VAT Number :`, `Customer Name`.
* **Control Totals:** Country-level billing summary blocks mapping currency, net, VAT, and gross values.

### II. Cards Filling List (Fuel Purchases)
Contains fuel transaction lines.
* **Odometer Splitting Quirks:** The registration plate and odometer reading are concatenated into a single string (e.g., `241 MH 236261000` or `252 MH 1845124021`). The system splits them using strict patterns:
  * **241 Pattern:** Registration is `241 MH \d{3}` (e.g., `241 MH 236`). Odometer is the remaining numbers (`261000`).
  * **252 Pattern (Type 1):** Starts with 1: `252 MH 1\d{3}` (4 digits reg). Remaining numbers is odometer.
  * **252 Pattern (Type 2):** Starts with 7 or 8: `252 MH [78]\d{2}` (3 digits reg). Remaining is odometer.
* **Detail Field Array:**
  * `Product Code` & `Product Name` (e.g. `03 DIESEL`, inherited if omitted on subsequent rows).
  * `Pump Code` (2-digit code).
  * `Country` (3-letter ISO code).
  * `Station Code` (4-letter alphanumeric code).
  * `Station Name`.
  * `Transaction Timestamp` (e.g., `08/05/2026 14:22`).
  * `Quantity` (Litres).
  * `Mileage` (Split odometer value).
  * `Unit Price`, `Rebate`, `Net Price`, `VAT`, `Amount Excl VAT`, `Amount Incl VAT`.

### III. PASSango Transaction Report (Electronic Tolls)
Lists toll road transactions.
* **Fields:** `Registration Number`, `OBU ID` (10-digit number), `Transaction Date`, `Reference Number` (e.g., `2026-FLN-0000041522`), `Region/Station Name` (e.g., `Bruxelles Sofico`), `Distance` (KM), `Net Amount`, `Gross Amount`.
