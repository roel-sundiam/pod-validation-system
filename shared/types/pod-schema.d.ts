export type PODStatus = 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type ValidationStatus = 'PASS' | 'FAIL' | 'REVIEW';
export type DocumentType = 'PALLET_NOTIFICATION_LETTER' | 'LOSCAM_DOCUMENT' | 'CUSTOMER_PALLET_RECEIVING' | 'SHIP_DOCUMENT' | 'INVOICE' | 'RAR' | 'UNKNOWN';
export type StampType = 'DISPATCH' | 'NO_PALLET' | 'PALLET' | 'WAREHOUSE' | 'LOSCAM' | 'SECURITY' | 'OTHER';
export type SignatureType = 'DRIVER' | 'RECEIVER' | 'CUSTOMER' | 'SECURITY' | 'WAREHOUSE_STAFF' | 'CARRIER' | 'STORE_MANAGER';
export type PeculiarityType = 'SIGNATURE_MISSING' | 'POOR_IMAGE_QUALITY' | 'QUANTITY_MISMATCH' | 'MISSING_REQUIRED_FIELD' | 'TEMPLATE_UNKNOWN' | 'HANDWRITTEN_NOTES' | 'MISSING_REQUIRED_DOCUMENT' | 'CROSS_DOCUMENT_MISMATCH' | 'DOCUMENT_TYPE_UNKNOWN' | 'MISSING_STAMP' | 'CONFLICTING_INFORMATION';
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export interface FileMetadata {
    originalName: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
    storagePath: string;
    checksum: string;
}
export interface DeliveryItem {
    itemCode?: string;
    description?: string;
    expectedQuantity?: number;
    deliveredQuantity?: number;
}
export interface NormalizedPODData {
    deliveryDate?: Date | null;
    recipientName?: string | null;
    recipientAddress?: string | null;
    driverName?: string | null;
    items: DeliveryItem[];
    remarks?: string | null;
}
export interface ExtractedData {
    rawText?: string;
    normalized: NormalizedPODData;
}
export interface SignatureCheck {
    expected: number;
    found: number;
    driverPresent: boolean;
    receiverPresent: boolean;
    confidence?: number;
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
export interface QuantityDiscrepancy {
    itemCode: string;
    expected: number;
    delivered: number;
    type: 'SHORTAGE' | 'OVERAGE';
}
export interface ItemsValidationCheck {
    matched: boolean;
    discrepancies: QuantityDiscrepancy[];
}
export interface TemplateMatchCheck {
    matched: boolean;
    confidence?: number;
}
export interface ValidationChecks {
    signatures: SignatureCheck;
    imageQuality: ImageQualityCheck;
    requiredFields: RequiredFieldsCheck;
    itemsValidation: ItemsValidationCheck;
    templateMatch?: TemplateMatchCheck;
}
export interface Peculiarity {
    type: PeculiarityType;
    severity: SeverityLevel;
    description: string;
    fieldPath?: string;
}
export interface ValidationResult {
    status: ValidationStatus;
    summary: string;
    timestamp: Date;
    checks: ValidationChecks;
    peculiarities: Peculiarity[];
}
export interface ProcessingMetadata {
    processedAt: Date;
    processingTimeMs: number;
    ocrEngine: string;
    ocrConfidence?: number;
}
export interface DocumentClassification {
    detectedType: DocumentType;
    confidence: number;
    keywords: string[];
    alternativeTypes: {
        type: DocumentType;
        confidence: number;
    }[];
}
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
export interface StampDetection {
    stamps: StampInfo[];
    signatures: SignatureInfo[];
}
export interface PODDocument {
    _id?: string;
    fileMetadata: FileMetadata;
    clientIdentifier?: string;
    deliveryId?: string;
    extractedData: ExtractedData;
    documentClassification?: DocumentClassification;
    stampDetection?: StampDetection;
    validationResult: ValidationResult;
    processingMetadata: ProcessingMetadata;
    status: PODStatus;
    createdAt: Date;
    updatedAt: Date;
}
export interface OCRResult {
    text: string;
    confidence: number;
    quality: {
        blurry: boolean;
        blurScore: number;
        lowContrast: boolean;
    };
}
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
    }[];
}
export interface ExpectedPODData {
    items?: {
        itemCode: string;
        expectedQuantity: number;
    }[];
}
export interface UploadResponse {
    success: boolean;
    data: {
        jobId: string;
        filesReceived: number;
        estimatedProcessingTime: number;
    };
}
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
export interface PODResponse {
    success: boolean;
    data: PODDocument;
}
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
export interface ErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: any;
    };
}
export interface HealthCheckResponse {
    success: boolean;
    data: {
        status: 'healthy' | 'degraded';
        database: 'connected' | 'disconnected';
        ocrService: 'available' | 'unavailable';
        timestamp: string;
    };
}
//# sourceMappingURL=pod-schema.d.ts.map