/**
 * Fuel Assurance — Canonical Domain Types
 *
 * This is the master type file. Every domain module imports from here.
 * All financial values are stored as strings for Decimal.js consumption.
 * All dates are ISO-8601 strings unless explicitly typed as Date.
 */

// ─── Enums ─────────────────────────────────────────────────────────────────────

/** Every possible reconciliation outcome. 27 statuses covering match, mismatch, and edge-case scenarios. */
export enum ReconciliationStatus {
  // ── Perfect / near-perfect matches ───────────────────────
  EXACT_MATCH = 'EXACT_MATCH',
  QUANTITY_TOLERANCE_MATCH = 'QUANTITY_TOLERANCE_MATCH',
  UNIT_PRICE_TOLERANCE_MATCH = 'UNIT_PRICE_TOLERANCE_MATCH',
  DATE_TOLERANCE_MATCH = 'DATE_TOLERANCE_MATCH',
  CROSS_MIDNIGHT_MATCH = 'CROSS_MIDNIGHT_MATCH',
  CARD_ALIAS_MATCH = 'CARD_ALIAS_MATCH',
  STATION_CODE_MATCH = 'STATION_CODE_MATCH',
  VEHICLE_ALIAS_MATCH = 'VEHICLE_ALIAS_MATCH',
  COMPOSITE_MATCH = 'COMPOSITE_MATCH',

  // ── Partial / uncertain ──────────────────────────────────
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  DATE_MISMATCH = 'DATE_MISMATCH',
  CARD_MISMATCH = 'CARD_MISMATCH',
  STATION_MISMATCH = 'STATION_MISMATCH',
  PRODUCT_MISMATCH = 'PRODUCT_MISMATCH',
  DUPLICATE_CANDIDATE = 'DUPLICATE_CANDIDATE',

  // ── Unmatched ────────────────────────────────────────────
  TX_ONLY = 'TX_ONLY',
  INV_ONLY = 'INV_ONLY',

  // ── Financial discrepancies ──────────────────────────────
  PRICE_VARIANCE = 'PRICE_VARIANCE',
  VAT_VARIANCE = 'VAT_VARIANCE',
  FEE_VARIANCE = 'FEE_VARIANCE',
  DISCOUNT_VARIANCE = 'DISCOUNT_VARIANCE',
  CURRENCY_VARIANCE = 'CURRENCY_VARIANCE',

  // ── Telematics ───────────────────────────────────────────
  TELEMATICS_VERIFIED = 'TELEMATICS_VERIFIED',
  TELEMATICS_UNLIKELY = 'TELEMATICS_UNLIKELY',
  NO_TELEMATICS = 'NO_TELEMATICS',

  // ── Procedural ───────────────────────────────────────────
  DECLINED = 'DECLINED',
  PERIOD_MISMATCH = 'PERIOD_MISMATCH',
}

/** Classification of telematics evidence against a transaction. */
export enum TelematicsClassification {
  VERIFIED = 'VERIFIED',
  LIKELY = 'LIKELY',
  REVIEW = 'REVIEW',
  UNLIKELY = 'UNLIKELY',
  INSUFFICIENT_EVIDENCE = 'INSUFFICIENT_EVIDENCE',
}

/** Dimensions that contribute to the telematics confidence score. */
export enum ConfidenceDimension {
  TIME_PROXIMITY = 'TIME_PROXIMITY',
  LOCATION_PROXIMITY = 'LOCATION_PROXIMITY',
  FUEL_LEVEL_MOVEMENT = 'FUEL_LEVEL_MOVEMENT',
  STOP_ENGINE_BEHAVIOUR = 'STOP_ENGINE_BEHAVIOUR',
  VOLUME_CONSISTENCY = 'VOLUME_CONSISTENCY',
  ODOMETER_CONSISTENCY = 'ODOMETER_CONSISTENCY',
}

/** How precise the timestamp is — helps downstream comparisons. */
export enum TimestampPrecision {
  EXACT = 'EXACT',
  MINUTE = 'MINUTE',
  HOUR = 'HOUR',
  DATE_ONLY = 'DATE_ONLY',
  ESTIMATED = 'ESTIMATED',
  UNKNOWN = 'UNKNOWN',
}

/** Template structure drift severity levels. */
export enum DriftClassification {
  NONE = 'NONE',
  COSMETIC = 'COSMETIC',
  MINOR = 'MINOR',
  MAJOR = 'MAJOR',
  BREAKING = 'BREAKING',
}

/** Known fuel / non-fuel product types. */
export enum ProductType {
  DIESEL = 'DIESEL',
  ADBLUE = 'ADBLUE',
  GNR = 'GNR',
  RED_DIESEL = 'RED_DIESEL',
  PETROL = 'PETROL',
  LPG = 'LPG',
  CNG = 'CNG',
  PARKING = 'PARKING',
  TOLL = 'TOLL',
  WASH = 'WASH',
  SERVICE_FEE = 'SERVICE_FEE',
  PASSANGO = 'PASSANGO',
  OTHER = 'OTHER',
  UNKNOWN = 'UNKNOWN',
}

/** Fuel-card providers. */
export enum CardProvider {
  DKV = 'DKV',
  AS24 = 'AS24',
  UNKNOWN = 'UNKNOWN',
}

/** Period overlap classification. */
export enum PeriodOverlap {
  FULL_OVERLAP = 'FULL_OVERLAP',
  PARTIAL_OVERLAP = 'PARTIAL_OVERLAP',
  NO_OVERLAP = 'NO_OVERLAP',
  UNKNOWN = 'UNKNOWN',
  ADJUSTMENT_PERIOD = 'ADJUSTMENT_PERIOD',
}

// ─── Import / File Metadata ────────────────────────────────────────────────────

/** Metadata about an imported file. */
export interface ImportFile {
  readonly id: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly uploadedAt: string;
  readonly uploadedBy: string;
  readonly parserProfileId: string;
  readonly parserVersion: string;
  readonly structureFingerprint: StructureFingerprint;
}

/** Metadata for one sheet / page within an imported file. */
export interface ImportPage {
  readonly fileId: string;
  readonly sheetIndex: number;
  readonly sheetName: string;
  readonly headerRow: number;
  readonly dataStartRow: number;
  readonly dataEndRow: number;
  readonly columnCount: number;
  readonly rowCount: number;
}

/** Metadata for a single imported row, for traceability. */
export interface ImportRow {
  readonly fileId: string;
  readonly sheetIndex: number;
  readonly rowIndex: number;
  readonly rawValues: ReadonlyArray<unknown>;
}

/** Describes how a parser was configured. */
export interface ParserProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly fileType: 'XLSX' | 'CSV' | 'PDF' | 'TSV';
  readonly provider: CardProvider;
  readonly dataType: 'TRANSACTION' | 'INVOICE' | 'GPS' | 'STATION';
  readonly version: ParserVersion;
  readonly mappingVersion: MappingVersion;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Semantic version of the parser logic. */
export interface ParserVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly label: string;
}

/** Semantic version of the column-mapping / alias registry. */
export interface MappingVersion {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly changelog: string;
}

// ─── Structure fingerprinting (used by drift detection) ────────────────────────

export interface StructureFingerprint {
  readonly headerRow: number;
  readonly headers: ReadonlyArray<string>;
  readonly columnCount: number;
  readonly dataStartRow: number;
  readonly sampleRowCount: number;
  readonly columnTypes: ReadonlyArray<ColumnTypeInfo>;
  readonly sheetName: string;
  readonly generatedAt: string;
}

export interface ColumnTypeInfo {
  readonly index: number;
  readonly header: string;
  readonly inferredType: 'string' | 'number' | 'date' | 'boolean' | 'empty' | 'mixed';
  readonly nullPercentage: number;
  readonly sampleValues: ReadonlyArray<string>;
}

// ─── Canonical Domain Types ────────────────────────────────────────────────────

/** Normalised transaction (from DKV or AS24 transaction data). */
export interface CanonicalTransaction {
  readonly id: string;
  readonly importFileId: string;
  readonly importRowIndex: number;

  // Core identity
  readonly registration: string;
  readonly cardNumber: string;
  readonly cardNumberNormalised: string;

  // When
  readonly transactionDate: string;        // ISO-8601
  readonly transactionTimestamp: string;    // ISO-8601 with time
  readonly timestampPrecision: TimestampPrecision;

  // Where
  readonly stationNumber: string;
  readonly stationNumberNormalised: string;
  readonly stationName: string;
  readonly stationCity: string;
  readonly serviceCountry: string;

  // What
  readonly productCode: string;
  readonly productGroup: string;
  readonly productName: string;
  readonly productType: ProductType;
  readonly costGroup: string;

  // How much (strings for Decimal.js)
  readonly quantity: string;
  readonly unit: string;
  readonly amountGross: string;
  readonly mileage: string;

  // Authorisation
  readonly authorisationId: string;
  readonly responseCode: string;
  readonly isApproved: boolean;

  // DKV variant-2 extras
  readonly customerId: string;
  readonly costCentre: string;
  readonly cardAddition: string;
  readonly stationCategory: string;

  // Provider
  readonly provider: CardProvider;
  readonly sourceEvidence?: SourceEvidence;
}

/** Normalised invoice row (from DKV or AS24 invoice data). */
export interface CanonicalInvoiceRow {
  readonly id: string;
  readonly importFileId: string;
  readonly importRowIndex: number;

  // Identity
  readonly registration: string;
  readonly cardNumber: string;
  readonly cardNumberNormalised: string;
  readonly equipmentNumber: string;

  // Document
  readonly invoiceNumber: string;
  readonly invoiceDate: string;
  readonly documentNumber: string;
  readonly ticketNumber: string;

  // When
  readonly transactionDate: string;
  readonly transactionTimestamp: string;
  readonly timestampPrecision: TimestampPrecision;
  readonly transactionNumber: string;

  // Where
  readonly stationNumber: string;
  readonly stationNumberNormalised: string;
  readonly stationName: string;
  readonly stationCity: string;
  readonly stationZipCode: string;
  readonly serviceCountry: string;
  readonly invoiceCountry: string;

  // What
  readonly productCode: string;
  readonly productGroup: string;
  readonly productName: string;
  readonly productType: ProductType;
  readonly costGroup: string;

  // Financials (strings for Decimal.js)
  readonly quantity: string;
  readonly unit: string;
  readonly pricePerUnit: string;
  readonly pricePerUnitGross: string;
  readonly baseValueNet: string;
  readonly baseValueGross: string;
  readonly serviceFeeNet: string;
  readonly valueOfPurchaseNet: string;
  readonly discountNet: string;
  readonly discountGross: string;
  readonly vat: string;
  readonly paymentCurrency: string;
  readonly serviceCurrency: string;
  readonly valueInPayCurrency: string;
  readonly valueInServiceCountryCurrency: string;

  // Cost centres
  readonly costCentre1: string;
  readonly costCentre2: string;

  // Extras
  readonly mileage: string;
  readonly agesTerminal: string;
  readonly customerId: string;
  readonly cardNumberPartner: string;

  // Provider
  readonly provider: CardProvider;

  // AS24 card-filling specific canonical fields
  readonly vehicleRegistration?: string;
  readonly pumpCode?: string;
  readonly countryCode?: string;
  readonly forecourtCode?: string;
  readonly forecourtName?: string;
  readonly transactionDateTime?: string;
  readonly mileageKm?: string;
  readonly litresPer100Km?: string;
  readonly volume?: string;
  readonly volumeUnit?: string;
  readonly stationCurrency?: string;
  readonly unitPriceVatIncluded?: string;
  readonly rebate?: string;
  readonly stationAmountExVat?: string;
  readonly stationVatAmount?: string;
  readonly paymentAmountExVat?: string;
  readonly paymentAmountInclVat?: string;
  readonly sourcePage?: number;
  readonly extractionConfidence?: number;
  readonly status?: string;
  readonly warnings?: string[];
  readonly financialMetadata?: {

    readonly paymentAmountExVat?: FinancialFieldMetadata;
    readonly volume?: FinancialFieldMetadata;
  };
  readonly sourceEvidence?: SourceEvidence;
}

export interface SourceEvidence {
  readonly sourceFileId: string;
  readonly sourceFileName: string;
  readonly sourceType: 'AS24_PDF' | 'DKV_PDF' | 'DKV_DAILY_XLS' | 'DKV_INVOICE_XLS' | 'GPS_XLS';
  readonly pageNumber?: number;
  readonly worksheetName?: string;
  readonly rowNumber?: number;
  readonly columnRange?: string;
  readonly boundingBox?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly rawText?: string;
  readonly extractedFields: Record<string, unknown>;
  readonly confidence: number;
  readonly parserVersion: string;
}

export interface FinancialFieldMetadata {
  readonly sourceHeading: string;
  readonly currency: string;
  readonly isNet: boolean;
  readonly isPaymentCurrency: boolean;
  readonly parserConfidence: number;
  readonly isFallback?: boolean;
}


/** Normalised GPS / telematics data point. */
export interface CanonicalTelematicsPoint {
  readonly id: string;
  readonly importFileId: string;
  readonly importRowIndex: number;

  // Vehicle
  readonly vehicleRegistration: string;
  readonly trailer: string;
  readonly driver: string;

  // When
  readonly timestamp: string;           // ISO-8601
  readonly timestampPrecision: TimestampPrecision;

  // Telemetry
  readonly fuelLevelPercent: number | null;
  readonly odometerKm: number | null;
  readonly speedKmh: number | null;
  readonly dataSource: string;
  readonly activity: string;
  readonly info: string;

  // Location — TEXT ONLY, no fabricated coordinates
  readonly locationCity: string;
  readonly locationTown: string;
  readonly locationStreet: string;
  readonly locationVillage: string;
  readonly locationAddress: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly sourceEvidence?: SourceEvidence;
}

/** Normalised station from the approved-station workbook. */
export interface CanonicalStation {
  readonly id: string;
  readonly importFileId: string;

  // Identity
  readonly stationCode: string;
  readonly stationCodeNormalised: string;
  readonly stationName: string;

  // Location
  readonly country: string;
  readonly city: string;
  readonly address: string;
  readonly postCode: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly url: string;

  // Pricing (strings for Decimal.js)
  readonly product: string;
  readonly productType: ProductType;
  readonly costPerLitre: string;
  readonly serviceFeePercent: string;
  readonly discount: string;
  readonly exciseDutyRebate: string;
  readonly netCostEurPerLitre: string;
  readonly applicationDate: string;

  // Source
  readonly sourceSheet: 'YARD_DKV' | 'RED_DIESEL_AS24' | 'DIESEL_AS24';
  readonly provider: CardProvider;
}

// ─── Vehicle & Card Identity ───────────────────────────────────────────────────

export interface Vehicle {
  readonly id: string;
  readonly primaryRegistration: string;
  readonly aliases: ReadonlyArray<VehicleAlias>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VehicleAlias {
  readonly registration: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly reason: string;
}

export interface Card {
  readonly id: string;
  readonly rawNumber: string;
  readonly normalisedCore: string;
  readonly provider: CardProvider;
  readonly aliases: ReadonlyArray<CardAlias>;
  readonly equipmentNumber: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CardAlias {
  readonly rawNumber: string;
  readonly normalisedCore: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly reason: string;
}

// ─── Reconciliation ────────────────────────────────────────────────────────────

export interface ReconciliationRun {
  readonly id: string;
  readonly createdAt: string;
  readonly completedAt: string;
  readonly config: ReconciliationConfig;
  readonly periodAlignment: PeriodAlignment;
  readonly matches: ReadonlyArray<ReconciliationMatch>;
  readonly unmatchedTransactions: ReadonlyArray<string>; // tx IDs
  readonly unmatchedInvoiceRows: ReadonlyArray<string>;  // inv IDs
  readonly statistics: ReconciliationStatistics;
}

export interface ReconciliationConfig {
  readonly quantityToleranceLitres: string;   // e.g. '0.02'
  readonly dateToleranceDays: number;
  readonly amountTolerancePercent: string;
  readonly enableCrossMidnight: boolean;
  readonly enableCardAliasMatching: boolean;
  readonly enableVehicleAliasMatching: boolean;
  readonly enableStationCodeMatching: boolean;
  readonly maxMatchingStages: number;
}

export interface ReconciliationMatch {
  readonly id: string;
  readonly transactionId: string;
  readonly invoiceRowId: string;
  readonly status: ReconciliationStatus;
  readonly matchStage: number;
  readonly confidence: number;              // 0-100
  readonly evidence: ReadonlyArray<MatchEvidence>;
  readonly reasonCodes: ReadonlyArray<string>;
  readonly financialAssessment: FinancialAssessment | null;
  readonly telematicsAssessment: TelematicsAssessment | null;
  readonly reviewDecision: ReviewDecision | null;
}

export interface MatchEvidence {
  readonly dimension: string;
  readonly transactionValue: string;
  readonly invoiceValue: string;
  readonly matches: boolean;
  readonly note: string;
}

export interface ReconciliationStatistics {
  readonly totalTransactions: number;
  readonly totalInvoiceRows: number;
  readonly matchedCount: number;
  readonly unmatchedTxCount: number;
  readonly unmatchedInvCount: number;
  readonly matchRate: number;                // percentage
  readonly byStatus: Readonly<Record<ReconciliationStatus, number>>;
  readonly byStage: ReadonlyArray<{ stage: number; count: number }>;
}

// ─── Period Alignment ──────────────────────────────────────────────────────────

export interface InvoicePeriod {
  readonly startDate: string;
  readonly endDate: string;
  readonly label: string;
}

export interface PeriodAlignment {
  readonly transactionDateRange: DateRange;
  readonly invoiceDateRange: DateRange;
  readonly userPeriod: InvoicePeriod | null;
  readonly overlap: PeriodOverlap;
  readonly overlapDays: number;
  readonly warnings: ReadonlyArray<string>;
  readonly blocksAllClear: boolean;
}

export interface DateRange {
  readonly earliest: string;
  readonly latest: string;
}

// ─── Financial Assessment ──────────────────────────────────────────────────────

export interface FinancialAssessment {
  readonly invoiceRowId: string;
  readonly isValid: boolean;
  readonly variances: ReadonlyArray<FinancialVariance>;
  readonly totalVarianceNet: string;
  readonly checkedAt: string;
  readonly configSnapshot: FinancialConfig;
}

export interface FinancialVariance {
  readonly field: string;
  readonly formula: string;
  readonly sourceValue: string;
  readonly expectedValue: string;
  readonly difference: string;
  readonly toleranceApplied: string;
  readonly withinTolerance: boolean;
  readonly reasonCode: string;
  readonly explanation: string;
}

export interface FinancialConfig {
  readonly quantityPriceTolerancePercent: string;
  readonly vatTolerancePercent: string;
  readonly feeTolerancePercent: string;
  readonly discountTolerancePercent: string;
  readonly currencyConversionTolerancePercent: string;
  readonly roundingToleranceAbsolute: string;
}

export interface StationPrice {
  readonly stationCode: string;
  readonly productType: ProductType;
  readonly netCostPerLitre: string;
  readonly serviceFeePercent: string;
  readonly discount: string;
  readonly exciseDutyRebate: string;
  readonly effectiveDate: string;
}

// ─── Telematics Assessment ─────────────────────────────────────────────────────

export interface TelematicsAssessment {
  readonly transactionId: string;
  readonly classification: TelematicsClassification;
  readonly totalScore: number;             // 0-100
  readonly factors: ReadonlyArray<TelematicsFactorResult>;
  readonly sessionId: string | null;
  readonly assessedAt: string;
  readonly configSnapshot: TelematicsConfig;
}

export interface TelematicsFactorResult {
  readonly dimension: ConfidenceDimension;
  readonly maxPoints: number;
  readonly awardedPoints: number;
  readonly sourceValue: string;
  readonly normalisedValue: string;
  readonly rule: string;
  readonly result: 'PASS' | 'PARTIAL' | 'FAIL' | 'SKIP';
  readonly explanation: string;
  readonly details?: any;
}

export interface TelematicsConfig {
  readonly timeWindowMinutes: number;
  readonly locationRadiusKm: number;
  readonly fuelLevelDropThresholdPercent: number;
  readonly stopDurationMinutes: number;
  readonly sessionGapMinutes: number;
  readonly weights: Readonly<Record<ConfidenceDimension, number>>;
}

/** A detected refuelling session grouping multiple transactions. */
export interface RefuellingSession {
  readonly id: string;
  readonly vehicleRegistration: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly stationCode: string;
  readonly transactionIds: ReadonlyArray<string>;
  readonly telematicsPointIds: ReadonlyArray<string>;
  readonly fuelLevelBefore: number | null;
  readonly fuelLevelAfter: number | null;
  readonly totalQuantity: string;
  readonly products: ReadonlyArray<ProductType>;
}

// ─── Reasoning Ledger ──────────────────────────────────────────────────────────

export interface ReasoningLedger {
  readonly id: string;
  readonly entityType: 'MATCH' | 'TRANSACTION' | 'INVOICE_ROW';
  readonly entityId: string;
  readonly factors: ReadonlyArray<ReasoningFactor>;
  readonly supportingEvidence: ReadonlyArray<EvidenceItem>;
  readonly contradictoryEvidence: ReadonlyArray<EvidenceItem>;
  readonly missingEvidence: ReadonlyArray<string>;
  readonly ruleSetVersion: RuleSetVersion;
  readonly machineResult: MachineResult;
  readonly manualDecision: ReviewDecision | null;
  readonly createdAt: string;
}

export interface ReasoningFactor {
  readonly factorName: string;
  readonly sourceValue: string;
  readonly normalisedValue: string;
  readonly rule: string;
  readonly maxPoints: number;
  readonly awardedPoints: number;
  readonly result: 'PASS' | 'PARTIAL' | 'FAIL' | 'SKIP' | 'N_A';
  readonly explanation: string;
}

export interface EvidenceItem {
  readonly source: string;
  readonly description: string;
  readonly value: string;
  readonly weight: number;
  readonly timestamp: string;
}

export interface MachineResult {
  readonly totalScore: number;
  readonly maxScore: number;
  readonly classification: string;
  readonly confidence: number;
  readonly generatedAt: string;
}

export interface RuleSetVersion {
  readonly version: string;
  readonly effectiveFrom: string;
  readonly description: string;
  readonly rules: ReadonlyArray<RuleDefinition>;
}

export interface RuleDefinition {
  readonly name: string;
  readonly dimension: string;
  readonly maxPoints: number;
  readonly description: string;
}

export interface ReviewDecision {
  readonly id: string;
  readonly entityId: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly decision: 'APPROVE' | 'REJECT' | 'ESCALATE' | 'OVERRIDE';
  readonly reason: string;
  readonly overrideStatus: ReconciliationStatus | null;
  readonly preserveMachineResult: boolean;
}

// ─── Schema Discovery Types ────────────────────────────────────────────────────

export interface CanonicalFieldDef {
  readonly fieldName: string;
  readonly required: boolean;
  readonly expectedType: 'string' | 'number' | 'date' | 'boolean';
  readonly description: string;
}

export interface ColumnMapping {
  readonly canonicalField: string;
  readonly sourceColumnIndex: number;
  readonly sourceHeader: string;
  readonly confidence: number;             // 0-1
  readonly matchedAlias: string;
  readonly isExact: boolean;
}

export interface SheetInfo {
  readonly index: number;
  readonly name: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly isEmpty: boolean;
  readonly headerRow: number | null;
}

export interface MappingAssessment {
  readonly confidence: number;             // 0-1
  readonly mappedCount: number;
  readonly requiredMappedCount: number;
  readonly totalRequired: number;
  readonly missing: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
}

// ─── Drift Report Types ────────────────────────────────────────────────────────

export interface DriftReport {
  readonly addedColumns: ReadonlyArray<string>;
  readonly removedColumns: ReadonlyArray<string>;
  readonly renamedColumns: ReadonlyArray<{ from: string; to: string; confidence: number }>;
  readonly reorderedColumns: ReadonlyArray<{ header: string; oldIndex: number; newIndex: number }>;
  readonly typeChanges: ReadonlyArray<{ header: string; oldType: string; newType: string }>;
  readonly headerRowMoved: boolean;
  readonly dataStartRowMoved: boolean;
  readonly columnCountDelta: number;
}

// ─── AS24 PDF Types ────────────────────────────────────────────────────────────

export interface PdfSection {
  readonly type: 'INVOICE_STATEMENT' | 'CARD_FILLING_LIST' | 'PASSANGO' | 'UNKNOWN';
  readonly startOffset: number;
  readonly endOffset: number;
  readonly text: string;
  readonly pageNumber: number | null;
}

export interface AS24InvoiceStatement {
  readonly invoiceNumber: string;
  readonly invoiceDate: string;
  readonly contractNumber: string;
  readonly customerName: string;
  readonly totalNetAmount: string;
  readonly totalVatAmount: string;
  readonly totalGrossAmount: string;
  readonly currency: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly controlTotals: ReadonlyArray<ControlTotal>;
}

export interface ControlTotal {
  readonly category: 'CARD' | 'PRODUCT' | 'CONTRACT' | 'COUNTRY';
  readonly label: string;
  readonly quantity: string;
  readonly netAmount: string;
  readonly grossAmount: string;
}

// ─── Raw parser intermediate types ─────────────────────────────────────────────

/** Raw row from DKV transaction file before normalisation. */
export interface RawDKVTransaction {
  readonly rowIndex: number;
  readonly licencePlate: string;
  readonly authorisationTime: unknown;       // could be Excel serial or string
  readonly sales: string;
  readonly costGroup: string;
  readonly productGroup: string;
  readonly product: string;
  readonly productCode: string;
  readonly authorisationAmountGross: string;
  readonly serviceCountry: string;
  readonly mileage: string;
  readonly cardOrBoxNumber: string;
  readonly response: string;
  // Variant 2 extras (may be undefined)
  readonly customerId?: string;
  readonly costCentre?: string;
  readonly cardAddition?: string;
  readonly stationNumber?: string;
  readonly stationName?: string;
  readonly town?: string;
  readonly stationCategory?: string;
  readonly unit?: string;
  readonly authorisationId?: string;
}

/** Raw row from DKV invoice file before normalisation. */
export interface RawDKVInvoiceRow {
  readonly rowIndex: number;
  readonly transactionTime: unknown;
  readonly stationName: string;
  readonly stationCity: string;
  readonly stationNumber: string;
  readonly transactionNumber: string;
  readonly serviceCountry: string;
  readonly costGroup: string;
  readonly productGroup: string;
  readonly product: string;
  readonly productCode: string;
  readonly paymentCurrency: string;
  readonly unit: string;
  readonly quantity: string;
  readonly pricePerUnit: string;
  readonly baseValueNet: string;
  readonly serviceFeeNet: string;
  readonly valueOfPurchaseNet: string;
  readonly serviceCurrency: string;
  readonly valueInPayCurrency: string;
  readonly valueInServiceCountryCurrency: string;
  readonly vat: string;
  readonly pricePerUnitGross: string;
  readonly discountNet: string;
  readonly licencePlate: string;
  readonly cardBoxNo: string;
  readonly cardBoxNoPartner: string;
  readonly invoiceDate: string;
  readonly documentNumber: string;
  readonly invoiceNumber: string;
  readonly ticketNumberDKV: string;
  readonly stationZipCode: string;
  readonly baseValueGross: string;
  readonly costCentre1: string;
  readonly costCentre2: string;
  readonly invoiceCountry: string;
  readonly mileage: string;
  readonly discountGross: string;
  readonly agesTerminal: string;
  readonly customerId: string;
  readonly equipmentNumber: string;
}

/** Raw row from GPS file before normalisation. */
export interface RawGPSPoint {
  readonly rowIndex: number;
  readonly vehicle: string;
  readonly trailer: string;
  readonly createdDate: unknown;
  readonly dataSource: string;
  readonly fuelLevel: string;
  readonly km: string;
  readonly speed: string;
  readonly driver: string;
  readonly activity: string;
  readonly info: string;
  readonly positionFromCity: string;
  readonly positionFromTown: string;
  readonly positionFromStreet: string;
  readonly positionFromVillage: string;
  readonly positionFromAddress: string;
}

/** Raw station row before normalisation. */
export interface RawStation {
  readonly sourceSheet: 'YARD_DKV' | 'RED_DIESEL_AS24' | 'DIESEL_AS24';
  readonly country: string;
  readonly pump: string;
  readonly stationCode: string;
  readonly stationName: string;
  readonly city: string;
  readonly address: string;
  readonly postCode: string;
  readonly url: string;
  readonly latitude: string;
  readonly longitude: string;
  readonly product: string;
  readonly cost: string;
  readonly serviceFeePercent: string;
  readonly discount: string;
  readonly exciseDutyRebate: string;
  readonly netCostEurPerLitre: string;
  readonly applicationDate: string;
}
