/**
 * Shared TypeScript interfaces for POD Validation System
 * Used by both frontend and backend for type safety
 */

// POD Processing Status
export type PODStatus = 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Validation Result Status
export type ValidationStatus = 'PASS' | 'FAIL' | 'REVIEW';

// Document Types (for multi-document deliveries)
export type DocumentType =
  | 'PALLET_NOTIFICATION_LETTER'
  | 'LOSCAM_DOCUMENT'
  | 'CUSTOMER_PALLET_RECEIVING'
  | 'SHIP_DOCUMENT'
  | 'INVOICE'
  | 'RAR'
  | 'UNKNOWN';

// Stamp Types (for stamp detection)
export type StampType =
  | 'DISPATCH'
  | 'NO_PALLET'
  | 'PALLET'
  | 'WAREHOUSE'
  | 'LOSCAM'
  | 'SECURITY'
  | 'OTHER';

// Signature Types (extended for multi-customer support)
export type SignatureType =
  | 'DRIVER'
  | 'RECEIVER'
  | 'CUSTOMER'
  | 'SECURITY'
  | 'WAREHOUSE_STAFF'
  | 'CARRIER'
  | 'STORE_MANAGER';

// Peculiarity Types
export type PeculiarityType =
  | 'SIGNATURE_MISSING'
  | 'POOR_IMAGE_QUALITY'
  | 'QUANTITY_MISMATCH'
  | 'MISSING_REQUIRED_FIELD'
  | 'TEMPLATE_UNKNOWN'
  | 'HANDWRITTEN_NOTES'
  | 'MISSING_REQUIRED_DOCUMENT'
  | 'CROSS_DOCUMENT_MISMATCH'
  | 'DOCUMENT_TYPE_UNKNOWN'
  | 'MISSING_STAMP'
  | 'CONFLICTING_INFORMATION';

// Severity Levels
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

// File Metadata
export interface FileMetadata {
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  storagePath: string;
  checksum: string;
}

// Item in delivery
export interface DeliveryItem {
  itemCode?: string;
  description?: string;
  expectedQuantity?: number;
  deliveredQuantity?: number;
}

// Normalized POD Data
export interface NormalizedPODData {
  deliveryDate?: Date | null;
  recipientName?: string | null;
  recipientAddress?: string | null;
  driverName?: string | null;
  items: DeliveryItem[];
  remarks?: string | null;
}

// Extracted Data
export interface ExtractedData {
  rawText?: string;
  normalized: NormalizedPODData;
}

// Signature Check Result
export interface SignatureCheck {
  expected: number;
  found: number;
  driverPresent: boolean;
  receiverPresent: boolean;
  confidence?: number;
}

// Image Quality Check Result
export interface ImageQualityCheck {
  blurry: boolean;
  blurScore?: number;
  incomplete: boolean;
  lowContrast: boolean;
}

// Required Fields Check Result
export interface RequiredFieldsCheck {
  missing: string[];
  present: string[];
}

// Quantity Discrepancy
export interface QuantityDiscrepancy {
  itemCode: string;
  expected: number;
  delivered: number;
  type: 'SHORTAGE' | 'OVERAGE';
}

// Items Validation Check Result
export interface ItemsValidationCheck {
  matched: boolean;
  discrepancies: QuantityDiscrepancy[];
}

// Template Match Check Result
export interface TemplateMatchCheck {
  matched: boolean;
  confidence?: number;
}

// All Validation Checks
export interface ValidationChecks {
  signatures: SignatureCheck;
  imageQuality: ImageQualityCheck;
  requiredFields: RequiredFieldsCheck;
  itemsValidation: ItemsValidationCheck;
  templateMatch?: TemplateMatchCheck;
}

// Peculiarity
export interface Peculiarity {
  type: PeculiarityType;
  severity: SeverityLevel;
  description: string;
  fieldPath?: string;
}

// Validation Result
export interface ValidationResult {
  status: ValidationStatus;
  summary: string;
  timestamp: Date;
  checks: ValidationChecks;
  peculiarities: Peculiarity[];
}

// Processing Metadata
export interface ProcessingMetadata {
  processedAt: Date;
  processingTimeMs: number;
  ocrEngine: string;
  ocrConfidence?: number;
}

// Document Classification Result
export interface DocumentClassification {
  detectedType: DocumentType;
  confidence: number;
  keywords: string[];
  alternativeTypes: {
    type: DocumentType;
    confidence: number;
  }[];
  manualOverride?: boolean;
  overrideReason?: string;
  overrideTimestamp?: Date;
  overrideBy?: string;
  inferredFromContext?: boolean;
}

// Stamp Information
export interface StampInfo {
  type: StampType;
  text: string;
  confidence: number;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Signature Information
export interface SignatureInfo {
  type: SignatureType;
  present: boolean;
  confidence: number;
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Stamp Detection Result
export interface StampDetection {
  stamps: StampInfo[];
  signatures: SignatureInfo[];
}

// Complete POD Document
export interface PODDocument {
  _id?: string;
  fileMetadata: FileMetadata;
  clientIdentifier?: string;
  deliveryId?: string; // NEW: Reference to parent delivery
  extractedData: ExtractedData;
  documentClassification?: DocumentClassification; // NEW: Document type classification
  stampDetection?: StampDetection; // NEW: Stamp and signature detection
  validationResult: ValidationResult;
  processingMetadata: ProcessingMetadata;
  status: PODStatus;
  createdAt: Date;
  updatedAt: Date;
}

// OCR Result
export interface OCRResult {
  text: string;
  confidence: number;
  quality: {
    blurry: boolean;
    blurScore: number;
    lowContrast: boolean;
  };
}

// Quality Metrics
export interface QualityMetrics {
  blurScore: number;
  contrast: number;
  resolution: {
    width: number;
    height: number;
  };
  isBlurry: boolean;
  isLowContrast: boolean;
  isLowResolution: boolean;
}

// Signature Detection Result
export interface SignatureDetectionResult {
  found: number;
  driverPresent: boolean;
  receiverPresent: boolean;
  confidence: number;
  regions: {
    x: number;
    y: number;
    width: number;
    height: number;
    isRightSide?: boolean;  // Optional: indicates if signature is on right side of document
  }[];
}

// Expected Data (for validation)
export interface ExpectedPODData {
  items?: {
    itemCode: string;
    expectedQuantity: number;
  }[];
}

// Upload Response
export interface UploadResponse {
  success: boolean;
  data: {
    jobId: string;
    filesReceived: number;
    estimatedProcessingTime: number;
  };
}

// Job Status Response
export interface JobStatusResponse {
  success: boolean;
  data: {
    status: PODStatus;
    progress: number;
    filesProcessed: number;
    filesTotal: number;
    podIds?: string[];
  };
}

// Single POD Response
export interface PODResponse {
  success: boolean;
  data: PODDocument;
}

// POD List Response
export interface PODListResponse {
  success: boolean;
  data: {
    pods: PODDocument[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  };
}

// Statistics Response
export interface StatisticsResponse {
  success: boolean;
  data: {
    totalProcessed: number;
    statusBreakdown: {
      pass: number;
      fail: number;
      review: number;
    };
    commonPeculiarities: {
      type: string;
      count: number;
    }[];
    averageProcessingTime: number;
  };
}

// Error Response
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

// Health Check Response
export interface HealthCheckResponse {
  success: boolean;
  data: {
    status: 'healthy' | 'degraded';
    database: 'connected' | 'disconnected';
    ocrService: 'available' | 'unavailable';
    timestamp: string;
  };
}
