// Re-export shared types from backend
// This ensures frontend and backend use the same type definitions

export interface PODDocument {
  _id: string;
  fileMetadata: FileMetadata;
  clientIdentifier?: string;
  deliveryId?: string;
  extractedData?: ExtractedData;
  validationResult?: ValidationResult;
  processingMetadata?: ProcessingMetadata;
  status: 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  updatedAt: Date;
}

export interface FileMetadata {
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  storagePath: string;
  checksum?: string;
}

export interface ExtractedData {
  rawText: string;
  normalized: NormalizedPODData;
}

export interface NormalizedPODData {
  deliveryDate: Date | null;
  recipientName: string | null;
  recipientAddress: string | null;
  recipientSignature?: string;
  driverName: string | null;
  driverSignature?: string;
  items: DeliveryItem[];
  remarks: string | null;
}

export interface DeliveryItem {
  itemCode: string;
  description: string;
  expectedQuantity?: number;
  deliveredQuantity: number;
  unit?: string;
}

export interface ValidationResult {
  status: 'PASS' | 'FAIL' | 'REVIEW';
  summary: string;
  timestamp: Date;
  checks: {
    signatures: SignatureCheck;
    imageQuality: ImageQualityCheck;
    requiredFields: RequiredFieldsCheck;
    itemsValidation: ItemsValidationCheck;
  };
  peculiarities: Peculiarity[];
}

export interface SignatureCheck {
  expected: number;
  found: number;
  driverPresent: boolean;
  receiverPresent: boolean;
}

export interface ImageQualityCheck {
  blurry: boolean;
  blurScore?: number;
  incomplete: boolean;
  lowContrast: boolean;
}

export interface RequiredFieldsCheck {
  missing: string[];
  present: string[];
}

export interface ItemsValidationCheck {
  matched: boolean;
  discrepancies: ItemDiscrepancy[];
}

export interface ItemDiscrepancy {
  itemCode: string;
  type: 'MISSING' | 'EXTRA' | 'QUANTITY_MISMATCH';
  expected?: number;
  delivered?: number;
}

export interface Peculiarity {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  field?: string;
}

export interface ProcessingMetadata {
  processedAt: Date;
  processingTimeMs: number;
  ocrEngine?: string;
  ocrConfidence?: number;
}

// API Response types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface UploadResponse {
  deliveryId?: string; // NEW: For multi-document deliveries
  jobId: string;
  filesReceived: number;
  estimatedProcessingTime: number; // Changed from string to number
  pods?: Array<{  // Made optional for delivery uploads
    id: string;
    fileName: string;
    size: number;
    checksum: string;
  }>;
}

export interface JobStatus {
  jobId: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  completedAt?: Date;
}

export interface PODListResponse {
  pods: PODDocument[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface StatisticsSummary {
  totalProcessed: number;
  statusBreakdown: {
    pass: number;
    fail: number;
    review: number;
  };
  commonPeculiarities: Array<{
    type: string;
    count: number;
  }>;
  averageProcessingTime: number;
  dateRange?: {
    from: Date;
    to: Date;
  };
}

// Validation Checklist Types
export type CheckStatus = 'PASSED' | 'FAILED' | 'NOT_APPLICABLE' | 'WARNING';

export interface ValidationCheckItem {
  name: string;
  status: CheckStatus;
  message: string;
  details?: any;
}

export interface DocumentValidationChecklist {
  documentType: string;
  podId?: string;
  checks: ValidationCheckItem[];
}

export interface DeliveryValidationChecklist {
  documentCompleteness: ValidationCheckItem[];
  documentSpecificChecks: DocumentValidationChecklist[];
  crossDocumentChecks: ValidationCheckItem[];
  overallStatus: 'PASS' | 'REVIEW' | 'FAIL';
  summary: string;
}
