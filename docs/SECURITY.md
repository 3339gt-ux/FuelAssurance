# Security and Compliance Architecture

The Fuel Assurance platform processes sensitive operational data, including financial invoicing records, fleet fuel card numbers, and vehicle GPS logs. To safeguard this data, the system implements multi-tenant isolation, row-level database security, file verification controls, and immutable audit logs.

---

## 1. Multi-Tenant Organisation Isolation

The platform uses a multi-tenant database design where all customer records are isolated within a single schema.

```
                   User Authenticates via Supabase Auth
                                    │
                  JWT token returns organisation_id
                                    │
                                    ▼
                 PostgreSQL Database Query Execution
                                    │
                     Row-Level Security Filter Applied
                  (WHERE organisation_id = JWT value)
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼ Tenant A                                            ▼ Tenant B
  Access restricted to                                  Access restricted to
  Tenant A records only                                 Tenant B records only
```

* **Core Tenant Key:** Almost every table in the schema (including `imports`, `transactions`, `invoice_rows`, `vehicles`, `cards`, and `reasoning_ledgers`) contains an `organisation_id` foreign key pointing to the master `organisations` table.
* **Session Binding:** When a user logs in, their authentication JWT is signed by Supabase. This token contains their assigned `organisation_id` in its payload, which is verified for every request.

---

## 2. Row Level Security (RLS) Policies

To prevent data leaks, Row Level Security (RLS) is enabled on all database tables:

```sql
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
```

### Typical Policy Definition
Every table has policies that restrict CRUD access based on the user's active session. For example, the SELECT policy for transactions is defined as:

```sql
CREATE POLICY select_transactions_policy ON transactions
  FOR SELECT
  USING (organisation_id = (auth.jwt() ->> 'organisation_id')::uuid);
```

### Key Security Guarantees
* **Database-Level Enforcement:** RLS policies are executed directly by PostgreSQL. Even if a bug in the Next.js API layer leaks queries, the database blocks records belonging to other tenants.
* **No Tenant Cross-Talk:** Subqueries, joins, and aggregations are filtered before execution, preventing cross-tenant leakage.

---

## 3. Secure File Storage & Time-Limited Signed URLs

Source files (AS24 PDFs, Excel spreadsheets) are stored in private Supabase Storage Buckets.

* **Private Storage:** Storage buckets are private by default. Public HTTP access is disabled.
* **Access Control:** Storage buckets use RLS policies matching the database tables. Users can only write or read files in folders matching their `organisation_id`.
* **Signed Access URLs:** The client-side dashboard does not access files directly. When an auditor views a source document, the Next.js server validates the session and requests a **time-limited Signed URL** from Supabase Storage:
  $$\text{Signed URL Lifetime} = 900 \text{ seconds (15 minutes)}$$
  Once the token expires, the URL becomes invalid, protecting the document from unauthorized access.

---

## 4. Credential Safety (No Service-Role Leakage)

The system uses two sets of API keys to interact with Supabase:
1. **Public Anonymous Key (`anon_key`):** Embedded in the client-side code, allowing users to authenticate and query data within the constraints of RLS.
2. **Service Role Key (`service_role`):** A high-privilege key that bypasses RLS policies.

### Protection Rules
* **Server-Only Variable:** The `service_role` key is stored as a secure environment variable on the server side. It is **never** loaded into the browser bundle.
* **Execution Boundary:** The system only uses the `service_role` key during initial seed scripts and automated system operations (e.g. database migrations). All web application routes execute queries using user JWTs to ensure RLS is enforced.

---

## 5. File Verification and Upload Controls

To protect the server from file upload vulnerabilities, the ingestion engine validates uploads before processing:

* **File Type Verification:** The system verifies the file extension and MIME type.
* **Header Signature (Magic Bytes) Verification:** The server reads the initial bytes of the file stream to verify its structure (e.g., verifying PDF headers start with `%PDF-` and Excel files match zip container signatures).
* **Upload Limits:** Upload sizes are capped at **50MB** for spreadsheets and **20MB** for AS24 PDFs.

---

## 6. Audit Trail and System Logs

The system maintains an audit trail (`audit_logs`) to track user actions:

* **Logged Events:** Records user logins, file uploads, manual data mapping, status overrides, and period sign-offs.
* **Schema Details:** Each audit log records the user ID, timestamp, IP address, action type, description, and a JSON object showing the before-and-after state of modified records.
* **Immutable Logs:** The database blocks DELETE or UPDATE operations on the audit log table, ensuring the integrity of the audit trail.
