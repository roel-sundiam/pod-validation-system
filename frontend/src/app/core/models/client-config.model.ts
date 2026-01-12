/**
 * Client Validation Configuration Models
 * Shared between frontend and backend
 */

export interface DocumentCompletenessRules {
  requirePalletNotificationLetter: boolean;
  requireLoscamDocument: boolean;
  requireCustomerPalletReceiving: boolean;
  requireShipDocument: boolean;
  requireInvoice: boolean;
  requireRAR: boolean;
  palletScenario?: 'WITH_PALLETS' | 'WITHOUT_PALLETS' | 'AUTO_DETECT';
}

export interface PalletValidationRules {
  enabled: boolean;
  requireWarehouseStamp: boolean;
  requireWarehouseSignature: boolean;
  requireCustomerSignature: boolean;
  requireDriverSignature: boolean;
  requireLoscamStamp: boolean;
}

export interface ShipDocumentValidationRules {
  enabled: boolean;
  requireDispatchStamp: boolean;
  requirePalletStamp: boolean;
  requireNoPalletStamp: boolean;
  requireSecuritySignature: boolean;
  requireTimeOutField: boolean;
  requireDriverSignature: boolean;
}

export interface InvoiceValidationRules {
  enabled: boolean;
  requirePOMatch: boolean;
  requireTotalCasesMatch: boolean;
  allowedVariancePercent: number;
  requireItemLevelMatch: boolean;
  compareFields: string[];
}

export interface CrossDocumentValidationRules {
  enabled: boolean;
  validateInvoiceRAR: boolean;
  allowedDiscrepancyCount: number;
  strictMode: boolean;
}

export interface ValidationRuleSet {
  documentCompleteness: DocumentCompletenessRules;
  palletValidation: PalletValidationRules;
  shipDocumentValidation: ShipDocumentValidationRules;
  invoiceValidation: InvoiceValidationRules;
  crossDocumentValidation: CrossDocumentValidationRules;
}

export interface ClientValidationConfig {
  _id?: string;
  clientId: string;
  clientName: string;
  description?: string;
  validationRules: ValidationRuleSet;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface ClientConfigResponse {
  success: boolean;
  data: ClientValidationConfig;
  meta?: {
    hasCustomConfig: boolean;
    isHardcoded: boolean;
  };
}

export interface ClientListResponse {
  success: boolean;
  data: ClientValidationConfig[];
  count: number;
}

export interface ValidationPreview {
  clientId: string;
  documentCompleteness: {
    required: string[];
    optional: string[];
    scenario: string;
  };
  validationChecks: {
    palletDocuments: boolean;
    shipDocument: boolean;
    invoice: boolean;
    crossDocument: boolean;
  };
  details: {
    palletValidation: any;
    shipDocument: any;
    invoice: any;
    crossDocument: any;
  };
}
