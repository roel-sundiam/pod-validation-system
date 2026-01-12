import { DocumentType, Peculiarity, ValidationStatus } from './pod-schema';
export type DeliveryStatus = 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export interface DeliveryDocumentRef {
    podId: string;
    detectedType?: DocumentType;
    classificationConfidence?: number;
    required: boolean;
}
export interface DocumentCompleteness {
    hasPallets?: boolean;
    requiredDocuments: string[];
    missingDocuments: string[];
    extraDocuments: string[];
}
export interface CrossDocumentCheck {
    checkType: string;
    status: 'PASS' | 'FAIL';
    description: string;
    details?: any;
}
export interface DeliveryValidationResult {
    status: ValidationStatus;
    summary: string;
    timestamp: Date;
    documentCompleteness: DocumentCompleteness;
    crossDocumentChecks: CrossDocumentCheck[];
    peculiarities: Peculiarity[];
}
export interface DeliveryProcessingMetadata {
    processedAt: Date;
    processingTimeMs: number;
    documentsProcessed: number;
    documentsFailed: number;
}
export interface DeliveryDocument {
    _id?: string;
    deliveryReference: string;
    clientIdentifier?: string;
    uploadedAt: Date;
    status: DeliveryStatus;
    documents: DeliveryDocumentRef[];
    deliveryValidation?: DeliveryValidationResult;
    processingMetadata?: DeliveryProcessingMetadata;
    createdAt: Date;
    updatedAt: Date;
}
export interface DeliveryUploadResponse {
    success: boolean;
    data: {
        deliveryId: string;
        jobId: string;
        filesReceived: number;
        estimatedProcessingTime: number;
    };
}
export interface DeliveryResponse {
    success: boolean;
    data: DeliveryDocument;
}
export interface DeliveryListResponse {
    success: boolean;
    data: {
        deliveries: DeliveryDocument[];
        pagination: {
            currentPage: number;
            totalPages: number;
            totalItems: number;
            itemsPerPage: number;
        };
    };
}
export interface DeliveryValidationResponse {
    success: boolean;
    data: {
        deliveryId: string;
        validation: DeliveryValidationResult;
        documents: {
            podId: string;
            documentType: DocumentType;
            individualValidation: {
                status: ValidationStatus;
                peculiarities: Peculiarity[];
            };
        }[];
    };
}
//# sourceMappingURL=delivery-schema.d.ts.map