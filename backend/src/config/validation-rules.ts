/**
 * Validation Rules Configuration
 * Centralized configuration for all validation thresholds and rules
 */

export const ValidationRulesConfig = {
  /**
   * Signature Validation Rules
   */
  signatures: {
    expectedCount: parseInt(process.env.SIGNATURE_REQUIRED_COUNT || '2'),
    minimumCount: 2,
    requireDriver: true,
    requireReceiver: true,
    confidenceThreshold: 30, // Minimum confidence to consider signature detected
  },

  /**
   * Image Quality Rules
   */
  imageQuality: {
    blurThreshold: parseFloat(process.env.BLUR_THRESHOLD || '100'),
    contrastThreshold: 15, // Minimum contrast percentage
    minResolution: {
      width: 400,
      height: 400,
    },
    allowLowQuality: false, // If false, low quality triggers REVIEW status
  },

  /**
   * Required Fields Rules
   */
  requiredFields: {
    deliveryDate: false, // Optional for MVP
    recipientName: false, // Optional for MVP
    items: true, // At least one item required
  },

  /**
   * Quantity Validation Rules
   */
  quantityValidation: {
    enabled: true,
    allowOverages: true, // Allow delivered > expected
    allowShortages: false, // Disallow delivered < expected (triggers REVIEW)
    tolerancePercent: 5, // Allow 5% variance
  },

  /**
   * Template Matching Rules
   */
  templateMatching: {
    enabled: false, // Disabled for MVP
    confidenceThreshold: 70,
    unknownTemplateStatus: 'REVIEW' as const, // Status for unknown templates
  },

  /**
   * OCR Confidence Rules
   */
  ocrConfidence: {
    minimumConfidence: parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD || '60'),
    lowConfidenceStatus: 'REVIEW' as const,
  },

  /**
   * Peculiarity Severity Thresholds
   */
  peculiaritySeverity: {
    signatureMissing: 'HIGH' as const,
    poorImageQuality: 'MEDIUM' as const,
    quantityMismatch: 'HIGH' as const,
    missingRequiredField: 'HIGH' as const,
    templateUnknown: 'LOW' as const,
    lowOCRConfidence: 'MEDIUM' as const,
  },

  /**
   * Overall Status Determination
   */
  statusRules: {
    // If any HIGH severity peculiarity, status = REVIEW
    highSeverityTriggersReview: true,
    // If 2+ MEDIUM severity peculiarities, status = REVIEW
    mediumSeverityThreshold: 2,
    // Auto-fail conditions (rare, mostly for corrupted files)
    autoFailConditions: {
      fileUnreadable: true,
      invalidFormat: true,
      processingError: true,
    },
  },
};

export type ValidationRulesConfig = typeof ValidationRulesConfig;
