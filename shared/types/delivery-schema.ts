/**
 * Shared TypeScript interfaces for Multi-Document Delivery Validation
 * Used for grouping multiple documents in a single delivery
 */

import { DocumentType, Peculiarity, ValidationStatus } from './pod-schema';

// Delivery Status
export type DeliveryStatus = 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

// Document Reference in Delivery
export interface DeliveryDocumentRef {
  podId: string;
  detectedType?: DocumentType;
  classificationConfidence?: number;
  required: boolean;
}

// Document Completeness Check
export interface DocumentCompleteness {
  hasPallets?: boolean;
  requiredDocuments: string[];
  missingDocuments: string[];
  extraDocuments: string[];
}

// Cross-Document Check Result
export interface CrossDocumentCheck {
  checkType: string;
  status: 'PASS' | 'FAIL';
  description: string;
  details?: any;
}

// Validation Check Item
export type CheckStatus = 'PASSED' | 'FAILED' | 'NOT_APPLICABLE' | 'WARNING';

export interface ValidationCheckItem {
  name: string;
  status: CheckStatus;
  message: string;
  details?: any;
}

// Document Validation Checklist
export interface DocumentValidationChecklist {
  documentType: DocumentType;
  podId?: string;
  checks: ValidationCheckItem[];
}

// Delivery Validation Checklist
export interface DeliveryValidationChecklist {
  documentCompleteness: ValidationCheckItem[];
  documentSpecificChecks: DocumentValidationChecklist[];
  crossDocumentChecks: ValidationCheckItem[];
  overallStatus: ValidationStatus;
  summary: string;
}

// Delivery Validation Result
export interface DeliveryValidationResult {
  status: ValidationStatus;
  summary: string;
  timestamp: Date;
  documentCompleteness: DocumentCompleteness;
  crossDocumentChecks: CrossDocumentCheck[];
  peculiarities: Peculiarity[];
  checklist?: DeliveryValidationChecklist; // NEW: Detailed validation checklist
}

// Delivery Processing Metadata
export interface DeliveryProcessingMetadata {
  processedAt: Date;
  processingTimeMs: number;
  documentsProcessed: number;
  documentsFailed: number;
}

// Complete Delivery Document
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

// Delivery Upload Response
export interface DeliveryUploadResponse {
  success: boolean;
  data: {
    deliveryId: string;
    jobId: string;
    filesReceived: number;
    estimatedProcessingTime: number;
  };
}

// Delivery Response
export interface DeliveryResponse {
  success: boolean;
  data: DeliveryDocument;
}

// Delivery List Response
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

// Delivery Validation Response
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
