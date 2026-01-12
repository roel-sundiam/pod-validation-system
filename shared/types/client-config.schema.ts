/**
 * Client Validation Configuration Schema
 *
 * Allows dynamic configuration of validation rules per client
 */

export interface DocumentCompletenessRules {
  requirePalletNotificationLetter: boolean;
  requireLoscamDocument: boolean;
  requireCustomerPalletReceiving: boolean;
  requireShipDocument: boolean;
  requireInvoice: boolean;
  requireRAR: boolean;
  // For WITH_PALLETS scenario: requires all 3 pallet docs
  // For WITHOUT_PALLETS scenario: pallet docs should be absent
  palletScenario?: "WITH_PALLETS" | "WITHOUT_PALLETS" | "AUTO_DETECT";
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
  compareFields: string[]; // e.g., ['poNumber', 'totalCases', 'items']
}

export interface CrossDocumentValidationRules {
  enabled: boolean;
  validateInvoiceRAR: boolean;
  allowedDiscrepancyCount: number;
  strictMode: boolean; // If true, any discrepancy fails validation
}

export interface AIEnhancementRules {
  enabled: boolean;
  enableGPT51CodexMax: boolean; // GPT-5.1-Codex-Max for enhanced OCR and validation
  modelVersion: string; // e.g., "gpt-5.1-codex-max"
  confidenceBoost: boolean; // Use AI to improve OCR confidence
  autoCorrection: boolean; // Auto-correct common OCR mistakes
}

export interface ValidationRuleSet {
  documentCompleteness: DocumentCompletenessRules;
  palletValidation: PalletValidationRules;
  shipDocumentValidation: ShipDocumentValidationRules;
  invoiceValidation: InvoiceValidationRules;
  crossDocumentValidation: CrossDocumentValidationRules;
  aiEnhancement: AIEnhancementRules;
}

export interface ClientValidationConfig {
  _id?: string;
  clientId: string; // e.g., "SUPER8", "CLIENT_B", "ACME_CORP"
  clientName: string; // Human-readable name
  description?: string;
  validationRules: ValidationRuleSet;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string; // Admin user who created this
  updatedBy?: string; // Admin user who last updated
}

// Default/Template configurations
export const DEFAULT_VALIDATION_CONFIG: ValidationRuleSet = {
  documentCompleteness: {
    requirePalletNotificationLetter: false,
    requireLoscamDocument: false,
    requireCustomerPalletReceiving: false,
    requireShipDocument: true,
    requireInvoice: true,
    requireRAR: true,
    palletScenario: "AUTO_DETECT",
  },
  palletValidation: {
    enabled: false,
    requireWarehouseStamp: false,
    requireWarehouseSignature: false,
    requireCustomerSignature: false,
    requireDriverSignature: false,
    requireLoscamStamp: false,
  },
  shipDocumentValidation: {
    enabled: true,
    requireDispatchStamp: true,
    requirePalletStamp: false,
    requireNoPalletStamp: false,
    requireSecuritySignature: true,
    requireTimeOutField: false,
    requireDriverSignature: false,
  },
  invoiceValidation: {
    enabled: true,
    requirePOMatch: true,
    requireTotalCasesMatch: true,
    allowedVariancePercent: 0,
    requireItemLevelMatch: false,
    compareFields: ["poNumber", "totalCases"],
  },
  crossDocumentValidation: {
    enabled: true,
    validateInvoiceRAR: true,
    allowedDiscrepancyCount: 0,
    strictMode: true,
  },
  aiEnhancement: {
    enabled: true,
    enableGPT51CodexMax: true,
    modelVersion: "gpt-5.1-codex-max",
    confidenceBoost: true,
    autoCorrection: true,
  },
};

// SUPER8 specific config (matches current hardcoded rules)
export const SUPER8_VALIDATION_CONFIG: ValidationRuleSet = {
  documentCompleteness: {
    requirePalletNotificationLetter: true,
    requireLoscamDocument: true,
    requireCustomerPalletReceiving: true,
    requireShipDocument: true,
    requireInvoice: true,
    requireRAR: true,
    palletScenario: "AUTO_DETECT",
  },
  palletValidation: {
    enabled: true,
    requireWarehouseStamp: true,
    requireWarehouseSignature: true,
    requireCustomerSignature: true,
    requireDriverSignature: true,
    requireLoscamStamp: true,
  },
  shipDocumentValidation: {
    enabled: true,
    requireDispatchStamp: true,
    requirePalletStamp: true, // When WITH_PALLETS
    requireNoPalletStamp: true, // When WITHOUT_PALLETS
    requireSecuritySignature: true,
    requireTimeOutField: true,
    requireDriverSignature: false,
  },
  invoiceValidation: {
    enabled: true,
    requirePOMatch: true,
    requireTotalCasesMatch: true,
    allowedVariancePercent: 0,
    requireItemLevelMatch: true,
    compareFields: ["poNumber", "totalCases", "items"],
  },
  crossDocumentValidation: {
    enabled: true,
    validateInvoiceRAR: true,
    allowedDiscrepancyCount: 0,
    strictMode: true,
  },
  aiEnhancement: {
    enabled: true,
    enableGPT51CodexMax: true,
    modelVersion: "gpt-5.1-codex-max",
    confidenceBoost: true,
    autoCorrection: true,
  },
};
