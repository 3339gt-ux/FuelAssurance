# Known Limitations & Technical Debt

This document outlines the current limitations, technical constraints, and planned improvements for the Fuel Assurance system.

---

## 1. GPS Proximity Checks & Text-Based Location Data

The most significant constraint in the current telematics scoring model is the format of the GPS data.

```
                        GPS Telemetry Points
                                 │
                 Does point contain coordinates?
                                 │
                   ┌─────────────┴─────────────┐
                   ▼ Yes                       ▼ No (Current State)
          Run Haversine Formula             Run Text Matching
       (Distance calculation in km)        (Address character overlap)
                                               │
                                               ▼
                                    Vulnerable to typos and
                                    regional spelling differences
```

* **No GPS Coordinates:** The current GPS telematics files do not contain latitude or longitude columns. They only provide text address descriptions (e.g., `positionFromCity: Dublin`, `positionFromAddress: Dublin Port POI`).
* **Text Proximity Matching:** The location proximity check relies on matching words in these address descriptions against the station city and name.
* **Limitations:** This text-matching approach is vulnerable to regional spelling variations, abbreviations, and typos:
  * A GPS address reading `"Dublin Port"` will not match a station record listing `"Dublin City"` without lowering the matching threshold.
  * There is no way to calculate the actual distance in kilometers between the vehicle's position and the pump location.
* **Technical Debt Resolution:** Upgrading the telematics data feed to include coordinates is required. Once coordinates are added, the proximity matcher will use the Haversine formula to verify that the vehicle was within a specific distance threshold (e.g. 150 meters) of the station:
  $$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$

---

## 2. Regex-Based AS24 PDF Parser

The AS24 PDF parser uses regular expressions and text offset boundaries.

* **Layout Sensitivity:** This approach is performant but highly sensitive to document structure changes. If AS24 modifies their invoice template (such as changing the header text `"CARDS FILLING LIST"`, adding columns, or shifting layout blocks), the parser will fail to find sections and reject the file.
* **Complexity of Concatenated Fields:** Splitting vehicle registrations and odometers from concatenated strings (such as `241 MH 236261000`) relies on strict registration patterns. If a vehicle uses a non-standard plate format, the regex split will fail, routing the row to the manual correction queue.
* **Technical Debt Resolution:** A future update will transition the parser to a layout-aware document processing engine (such as AWS Textract or Microsoft Form Recogniser) to handle layout shifts dynamically.

---

## 3. Lack of OCR (Optical Character Recognition)

The ingestion engine requires native vector PDF documents.

* **Scanned Files Rejected:** If an operator scans a paper invoice and uploads the image PDF, the parser will fail because it cannot extract text layers using standard character stream queries.
* **No Digitisation for Paper Invoices:** Fleet operators who receive paper invoices must enter transactions manually.
* **Technical Debt Resolution:** Integrating an OCR library (such as Tesseract OCR or a cloud service) will allow the system to process scanned document uploads.

---

## 4. Supabase Database Connection & Mock Testing

While the database schema migrations (`db/migrations/`) are fully defined, the local testing environment runs on mock drivers:
* **Mock DB Drivers:** Local tests run calculations using static data arrays.
* **Next Steps:** Connecting the application code to a live Supabase instance and configuring tables, storage buckets, and RLS policies is required before staging.

---

## 5. UI Dashboard Skeleton

The user interface layouts are frontend skeletons.
* **Interactive Placeholders:** Pages like the Identity Mapping Queue, Custom Report Builder, and Manual Override Dialogs display static mock data.
* **Next Steps:** Implementing Next.js server actions and API routes to connect these frontend views to Supabase database tables.
