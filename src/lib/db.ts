import fs from 'fs';
import path from 'path';
import { generateId } from './utils';

const DB_PATH = path.join(process.cwd(), 'local_db.json');

export interface DatabaseSchema {
  organisations: any[];
  users: any[];
  import_files: any[];
  import_pages: any[];
  import_rows: any[];
  import_fields: any[];
  import_mappings: any[];
  parser_profiles: any[];
  parser_versions: any[];
  transactions: any[];
  invoice_transactions: any[];
  telematics_points: any[];
  reconciliation_runs: any[];
  reconciliation_matches: any[];
  reasoning_ledgers: any[];
  vehicles: any[];
  vehicle_aliases: any[];
  cards: any[];
  card_assignments: any[];
  stations: any[];
  station_aliases: any[];
  prices: any[];
  discounts: any[];
  review_decisions: any[];
  audit_events: any[];
  simple_checks: any[];
  transaction_batches: any[];
}


export const DEFAULT_ORG_ID = 'd3b07384-d113-4956-a5b2-7c30d1d3d4b4';
export const DEFAULT_USER_ID = 'e5c1a7b0-84a2-4a1e-84b2-9a7e8a9f0b12';

const initialSchema: DatabaseSchema = {
  organisations: [
    {
      id: DEFAULT_ORG_ID,
      name: 'Ola Transport',
      subdomain: 'ola',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  users: [
    {
      id: DEFAULT_USER_ID,
      org_id: DEFAULT_ORG_ID,
      email: 'audit@fuelassurance.com',
      role: 'auditor',
      first_name: 'Graham',
      last_name: 'Audit',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  import_files: [],
  import_pages: [],
  import_rows: [],
  import_fields: [],
  import_mappings: [],
  parser_profiles: [],
  parser_versions: [],
  transactions: [],
  invoice_transactions: [],
  telematics_points: [],
  reconciliation_runs: [],
  reconciliation_matches: [],
  reasoning_ledgers: [],
  vehicles: [
    // Pre-populate some vehicles from the spec / sample files
    { id: 'v1', org_id: DEFAULT_ORG_ID, registration: '241MH2362', make: 'Volvo', model: 'FH', active: true, created_at: new Date().toISOString() },
    { id: 'v2', org_id: DEFAULT_ORG_ID, registration: '252MH1234', make: 'Scania', model: 'R500', active: true, created_at: new Date().toISOString() },
    { id: 'v3', org_id: DEFAULT_ORG_ID, registration: '252MH7890', make: 'DAF', model: 'XF', active: true, created_at: new Date().toISOString() },
    { id: 'v4', org_id: DEFAULT_ORG_ID, registration: '241MH2436', make: 'Mercedes', model: 'Actros', active: true, created_at: new Date().toISOString() },
  ],
  vehicle_aliases: [],
  cards: [
    // Pre-populate cards from sample workbooks
    { id: 'c1', org_id: DEFAULT_ORG_ID, card_number: '0001-2', card_number_normalised: '0001-2', provider: 'AS24', active: true },
    { id: 'c2', org_id: DEFAULT_ORG_ID, card_number: '700123', card_number_normalised: '700123', provider: 'DKV', active: true },
    { id: 'obu1', org_id: DEFAULT_ORG_ID, card_number: '6078110082', card_number_normalised: '6078110082', provider: 'AS24', active: true },
  ],
  card_assignments: [
    { id: 'ca1', org_id: DEFAULT_ORG_ID, card_id: 'c1', vehicle_id: 'v1', effective_from: '2026-01-01T00:00:00Z', effective_to: null },
    { id: 'ca2', org_id: DEFAULT_ORG_ID, card_id: 'obu1', vehicle_id: 'v4', effective_from: '2026-01-01T00:00:00Z', effective_to: null },
  ],
  stations: [],
  station_aliases: [],
  prices: [],
  discounts: [],
  review_decisions: [],
  audit_events: [],
  simple_checks: [],
  transaction_batches: [],
};


class LocalDatabase {
  private cache: DatabaseSchema | null = null;
  private importFileByHash: Map<string, unknown> | null = null;

  private buildIndexes(data: DatabaseSchema): void {
    this.importFileByHash = new Map(
      data.import_files
        .filter((f: { file_hash?: string }) => f.file_hash)
        .map((f: { file_hash: string }) => [f.file_hash, f])
    );
  }

  private read(): DatabaseSchema {
    if (this.cache) return this.cache;

    if (!fs.existsSync(DB_PATH)) {
      this.write(initialSchema);
      this.cache = initialSchema;
      this.buildIndexes(initialSchema);
      return initialSchema;
    }

    try {
      const data = fs.readFileSync(DB_PATH, 'utf8');
      const parsed = JSON.parse(data);
      // Ensure all tables exist in loaded json
      const merged = { ...initialSchema };
      for (const key of Object.keys(initialSchema) as Array<keyof DatabaseSchema>) {
        if (Array.isArray(parsed[key])) {
          (merged as any)[key] = parsed[key];
        }
      }
      this.cache = merged;
      this.buildIndexes(merged);
      return merged;
    } catch (err) {
      console.error('Error reading local database, resetting to initial schema:', err);
      this.write(initialSchema);
      this.cache = initialSchema;
      this.buildIndexes(initialSchema);
      return initialSchema;
    }
  }

  private write(data: DatabaseSchema): void {
    try {
      const tmpPath = `${DB_PATH}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
      fs.renameSync(tmpPath, DB_PATH);
      this.cache = data;
      this.buildIndexes(data);
    } catch (err) {
      console.error('Error writing to local database:', err);
    }
  }

  public findImportByHash(hash: string): unknown | null {
    const data = this.read();
    if (!this.importFileByHash) this.buildIndexes(data);
    return this.importFileByHash?.get(hash) ?? null;
  }

  public getTable<T extends keyof DatabaseSchema>(table: T): DatabaseSchema[T] {
    const data = this.read();
    return data[table];
  }

  public select<T extends keyof DatabaseSchema>(
    table: T,
    filter?: (item: any) => boolean,
    orgId: string = DEFAULT_ORG_ID
  ): DatabaseSchema[T] {
    const rows = this.getTable(table);
    // Filter by tenant org_id if column exists, except system profiles or organisations tables
    return rows.filter((item: any) => {
      const matchesOrg = table === 'organisations' || !('org_id' in item) || item.org_id === orgId;
      if (!matchesOrg) return false;
      return filter ? filter(item) : true;
    });
  }

  public find<T extends keyof DatabaseSchema>(
    table: T,
    filter: (item: any) => boolean,
    orgId: string = DEFAULT_ORG_ID
  ): any {
    const items = this.select(table, filter, orgId);
    return items.length > 0 ? items[0] : null;
  }

  public insert<T extends keyof DatabaseSchema>(
    table: T,
    row: any,
    orgId: string = DEFAULT_ORG_ID
  ): any {
    const data = this.read();
    const newRow = {
      id: row.id || generateId(),
      ...(table !== 'organisations' && table !== 'parser_profiles' && table !== 'parser_versions' ? { org_id: orgId } : {}),
      ...row,
      created_at: row.created_at || new Date().toISOString(),
      ...(row.updated_at || 'updated_at' in row ? { updated_at: new Date().toISOString() } : {}),
    };

    data[table].push(newRow);
    this.write(data);

    // Auto log audit events
    if (table !== 'audit_events' && table !== 'import_rows' && table !== 'import_fields') {
      this.logAudit(
        'INSERT',
        table,
        newRow.id,
        `Inserted record in table ${table}`,
        orgId
      );
    }

    return newRow;
  }

  public insertMany<T extends keyof DatabaseSchema>(
    table: T,
    rows: any[],
    orgId: string = DEFAULT_ORG_ID
  ): any[] {
    const data = this.read();
    const newRows = rows.map((row) => ({
      id: row.id || generateId(),
      ...(table !== 'organisations' && table !== 'parser_profiles' && table !== 'parser_versions' ? { org_id: orgId } : {}),
      ...row,
      created_at: row.created_at || new Date().toISOString(),
      ...(row.updated_at || 'updated_at' in row ? { updated_at: new Date().toISOString() } : {}),
    }));

    data[table].push(...newRows);
    this.write(data);
    return newRows;
  }

  public update<T extends keyof DatabaseSchema>(
    table: T,
    id: string,
    row: any,
    orgId: string = DEFAULT_ORG_ID
  ): any {
    const data = this.read();
    const index = data[table].findIndex(
      (item: any) => item.id === id && (table === 'organisations' || !('org_id' in item) || item.org_id === orgId)
    );

    if (index === -1) return null;

    const oldRow = data[table][index];
    const updatedRow = {
      ...oldRow,
      ...row,
      id, // ensure ID is preserved
      updated_at: new Date().toISOString(),
    };

    data[table][index] = updatedRow;
    this.write(data);

    if (table !== 'audit_events' && table !== 'import_rows' && table !== 'import_fields') {
      this.logAudit(
        'UPDATE',
        table,
        id,
        `Updated record in table ${table}`,
        orgId
      );
    }

    return updatedRow;
  }

  public delete<T extends keyof DatabaseSchema>(
    table: T,
    id: string,
    orgId: string = DEFAULT_ORG_ID
  ): boolean {
    const data = this.read();
    const lengthBefore = data[table].length;
    data[table] = data[table].filter(
      (item: any) => !(item.id === id && (table === 'organisations' || !('org_id' in item) || item.org_id === orgId))
    );

    const deleted = data[table].length < lengthBefore;
    if (deleted) {
      this.write(data);
      this.logAudit('DELETE', table, id, `Deleted record in table ${table}`, orgId);
    }
    return deleted;
  }

  public truncate<T extends keyof DatabaseSchema>(table: T, orgId: string = DEFAULT_ORG_ID): void {
    const data = this.read();
    if (table === 'organisations') {
      data[table] = [];
    } else {
      data[table] = data[table].filter((item: any) => ('org_id' in item) && item.org_id !== orgId);
    }
    this.write(data);
  }

  public logAudit(
    eventType: string,
    targetType: string,
    targetId: string,
    details: string,
    orgId: string = DEFAULT_ORG_ID
  ): void {
    const data = this.read();
    const event = {
      id: generateId(),
      org_id: orgId,
      user_id: DEFAULT_USER_ID,
      event_type: eventType,
      target_type: targetType,
      target_id: targetId,
      details,
      ip_address: '127.0.0.1',
      created_at: new Date().toISOString(),
    };
    data.audit_events.push(event);
    this.write(data);
  }
}

export const db = new LocalDatabase();
