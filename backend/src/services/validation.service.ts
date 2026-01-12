import {
  ValidationResult,
  ValidationStatus,
  Peculiarity,
  PeculiarityType,
  SeverityLevel,
  NormalizedPODData,
  ExpectedPODData,
  QualityMetrics,
  SignatureDetectionResult,
} from "../../../shared/types/pod-schema";
import { ValidationRulesConfig } from "../config/validation-rules";
import { createModuleLogger } from "../middleware/logger";

const logger = createModuleLogger("ValidationService");

/**
 * Validation Context
 * All data needed for validation
 */
export interface ValidationContext {
  normalized: NormalizedPODData;
  signatures: SignatureDetectionResult;
  imageQuality?: QualityMetrics;
  ocrConfidence: number;
  expected?: ExpectedPODData;
  mimeType: string;
}

/**
 * Main Validation Function
 * Orchestrates all validation rules and generates final result
 */
export const validatePOD = (context: ValidationContext): ValidationResult => {
  try {
    logger.info("Starting POD validation");

    const peculiarities: Peculiarity[] = [];

    // 1. Validate Signatures
    const signatureCheck = validateSignatures(
      context.signatures,
      peculiarities
    );

    // 2. Validate Image Quality (only for images/PDFs)
    const imageQualityCheck = validateImageQuality(
      context.imageQuality,
      context.mimeType,
      peculiarities
    );

    // 3. Validate Required Fields
    const requiredFieldsCheck = validateRequiredFields(
      context.normalized,
      peculiarities
    );

    // 4. Validate Quantities (if expected data provided)
    const itemsValidationCheck = validateQuantities(
      context.normalized,
      context.expected,
      peculiarities
    );

    // 5. Validate OCR Confidence
    validateOCRConfidence(context.ocrConfidence, peculiarities);

    // 6. Template Matching (placeholder for future)
    const templateMatchCheck = {
      matched: false,
      confidence: 0,
    };

    // Determine overall status
    const status = determineStatus(peculiarities);

    // Generate summary
    const summary = generateSummary(status, peculiarities, context);

    const validationResult: ValidationResult = {
      status,
      summary,
      timestamp: new Date(),
      checks: {
        signatures: signatureCheck,
        imageQuality: imageQualityCheck,
        requiredFields: requiredFieldsCheck,
        itemsValidation: itemsValidationCheck,
        templateMatch: templateMatchCheck,
      },
      peculiarities,
    };

    logger.info("Validation complete", {
      status,
      peculiarityCount: peculiarities.length,
    });

    return validationResult;
  } catch (error) {
    logger.error("Error during validation", { error });

    // Return FAIL status on validation error
    return {
      status: "FAIL",
      summary: "Validation failed due to processing error",
      timestamp: new Date(),
      checks: {
        signatures: {
          expected: 2,
          found: 0,
          driverPresent: false,
          receiverPresent: false,
        },
        imageQuality: {
          blurry: false,
          incomplete: false,
          lowContrast: false,
        },
        requiredFields: {
          missing: [],
          present: [],
        },
        itemsValidation: {
          matched: false,
          discrepancies: [],
        },
      },
      peculiarities: [
        {
          type: "MISSING_REQUIRED_FIELD",
          severity: "HIGH",
          description: "Validation processing error",
        },
      ],
    };
  }
};

/**
 * Validate Signatures
 */
const validateSignatures = (
  signatures: SignatureDetectionResult,
  peculiarities: Peculiarity[]
): ValidationResult["checks"]["signatures"] => {
  const config = ValidationRulesConfig.signatures;

  const signatureCheck: ValidationResult["checks"]["signatures"] = {
    expected: config.expectedCount,
    found: signatures.found,
    driverPresent: signatures.driverPresent,
    receiverPresent: signatures.receiverPresent,
    confidence:
      typeof signatures.confidence === "number" &&
      !isNaN(signatures.confidence) &&
      isFinite(signatures.confidence)
        ? Math.max(0, Math.min(100, signatures.confidence))
        : 0,
  };

  // Check if signatures are missing
  if (signatures.found < config.minimumCount) {
    peculiarities.push({
      type: "SIGNATURE_MISSING",
      severity: ValidationRulesConfig.peculiaritySeverity.signatureMissing,
      description: `Only ${signatures.found} signature(s) found, expected ${
        config.expectedCount
      }. ${!signatures.driverPresent ? "Driver signature missing. " : ""}${
        !signatures.receiverPresent ? "Receiver signature missing." : ""
      }`,
    });
  }

  // Check specific signature requirements
  if (config.requireDriver && !signatures.driverPresent) {
    peculiarities.push({
      type: "SIGNATURE_MISSING",
      severity: ValidationRulesConfig.peculiaritySeverity.signatureMissing,
      description: "Driver signature is required but not found",
      fieldPath: "signatures.driver",
    });
  }

  if (config.requireReceiver && !signatures.receiverPresent) {
    peculiarities.push({
      type: "SIGNATURE_MISSING",
      severity: ValidationRulesConfig.peculiaritySeverity.signatureMissing,
      description: "Receiver signature is required but not found",
      fieldPath: "signatures.receiver",
    });
  }

  return signatureCheck;
};

/**
 * Validate Image Quality
 */
const validateImageQuality = (
  quality: QualityMetrics | undefined,
  mimeType: string,
  peculiarities: Peculiarity[]
): ValidationResult["checks"]["imageQuality"] => {
  // Only validate quality for images and PDFs
  if (
    !quality ||
    (!mimeType.startsWith("image/") && mimeType !== "application/pdf")
  ) {
    return {
      blurry: false,
      incomplete: false,
      lowContrast: false,
    };
  }

  const imageQualityCheck: ValidationResult["checks"]["imageQuality"] = {
    blurry: quality.isBlurry,
    blurScore: quality.blurScore,
    incomplete: false, // Will be updated below
    lowContrast: quality.isLowContrast,
  };

  const issues: string[] = [];

  if (quality.isBlurry) {
    issues.push(`blurry image (score: ${quality.blurScore.toFixed(2)})`);
  }

  if (quality.isLowContrast) {
    issues.push(`low contrast (${quality.contrast.toFixed(2)}%)`);
  }

  if (quality.isLowResolution) {
    issues.push(
      `low resolution (${quality.resolution.width}x${quality.resolution.height})`
    );
    imageQualityCheck.incomplete = true;
  }

  if (issues.length > 0) {
    peculiarities.push({
      type: "POOR_IMAGE_QUALITY",
      severity: ValidationRulesConfig.peculiaritySeverity.poorImageQuality,
      description: `Image quality issues detected: ${issues.join(", ")}`,
    });
  }

  return imageQualityCheck;
};

/**
 * Validate Required Fields
 */
const validateRequiredFields = (
  normalized: NormalizedPODData,
  peculiarities: Peculiarity[]
): ValidationResult["checks"]["requiredFields"] => {
  const config = ValidationRulesConfig.requiredFields;

  const missing: string[] = [];
  const present: string[] = [];

  // Check delivery date
  if (config.deliveryDate) {
    if (normalized.deliveryDate) {
      present.push("deliveryDate");
    } else {
      missing.push("deliveryDate");
    }
  }

  // Check recipient name
  if (config.recipientName) {
    if (normalized.recipientName) {
      present.push("recipientName");
    } else {
      missing.push("recipientName");
    }
  }

  // Check items
  if (config.items) {
    if (normalized.items.length > 0) {
      present.push("items");
    } else {
      missing.push("items");
    }
  }

  // Add peculiarities for missing required fields
  missing.forEach((field) => {
    peculiarities.push({
      type: "MISSING_REQUIRED_FIELD",
      severity: ValidationRulesConfig.peculiaritySeverity.missingRequiredField,
      description: `Required field '${field}' is missing or could not be extracted`,
      fieldPath: field,
    });
  });

  return {
    missing,
    present,
  };
};

/**
 * Validate Quantities
 */
const validateQuantities = (
  normalized: NormalizedPODData,
  expected: ExpectedPODData | undefined,
  peculiarities: Peculiarity[]
): ValidationResult["checks"]["itemsValidation"] => {
  const config = ValidationRulesConfig.quantityValidation;

  if (
    !config.enabled ||
    !expected ||
    !expected.items ||
    expected.items.length === 0
  ) {
    return {
      matched: true,
      discrepancies: [],
    };
  }

  const discrepancies: ValidationResult["checks"]["itemsValidation"]["discrepancies"] =
    [];

  // Match items by item code
  expected.items.forEach((expectedItem) => {
    const normalizedItem = normalized.items.find(
      (item) => item.itemCode === expectedItem.itemCode
    );

    if (!normalizedItem || normalizedItem.deliveredQuantity === undefined) {
      // Item not found in delivery
      discrepancies.push({
        itemCode: expectedItem.itemCode,
        expected: expectedItem.expectedQuantity,
        delivered: 0,
        type: "SHORTAGE",
      });

      peculiarities.push({
        type: "QUANTITY_MISMATCH",
        severity: ValidationRulesConfig.peculiaritySeverity.quantityMismatch,
        description: `Item ${expectedItem.itemCode}: Expected ${expectedItem.expectedQuantity}, not found in delivery`,
        fieldPath: `items.${expectedItem.itemCode}`,
      });
    } else {
      const delivered = normalizedItem.deliveredQuantity;
      const expected = expectedItem.expectedQuantity;

      // Calculate variance percentage
      const variance = (Math.abs(delivered - expected) / expected) * 100;

      // Check if within tolerance
      if (variance > config.tolerancePercent) {
        if (delivered < expected) {
          // Shortage
          if (!config.allowShortages) {
            discrepancies.push({
              itemCode: expectedItem.itemCode,
              expected,
              delivered,
              type: "SHORTAGE",
            });

            peculiarities.push({
              type: "QUANTITY_MISMATCH",
              severity:
                ValidationRulesConfig.peculiaritySeverity.quantityMismatch,
              description: `Item ${expectedItem.itemCode}: Expected ${expected}, delivered ${delivered} (shortage)`,
              fieldPath: `items.${expectedItem.itemCode}.quantity`,
            });
          }
        } else {
          // Overage
          if (!config.allowOverages) {
            discrepancies.push({
              itemCode: expectedItem.itemCode,
              expected,
              delivered,
              type: "OVERAGE",
            });

            peculiarities.push({
              type: "QUANTITY_MISMATCH",
              severity: "MEDIUM",
              description: `Item ${expectedItem.itemCode}: Expected ${expected}, delivered ${delivered} (overage)`,
              fieldPath: `items.${expectedItem.itemCode}.quantity`,
            });
          }
        }
      }
    }
  });

  return {
    matched: discrepancies.length === 0,
    discrepancies,
  };
};

/**
 * Validate OCR Confidence
 */
const validateOCRConfidence = (
  confidence: number,
  peculiarities: Peculiarity[]
): void => {
  const config = ValidationRulesConfig.ocrConfidence;

  if (confidence < config.minimumConfidence) {
    peculiarities.push({
      type: "POOR_IMAGE_QUALITY",
      severity: ValidationRulesConfig.peculiaritySeverity.lowOCRConfidence,
      description: `Low OCR confidence (${confidence.toFixed(
        2
      )}%), extracted data may be inaccurate`,
    });
  }
};

/**
 * Determine Overall Status
 */
const determineStatus = (peculiarities: Peculiarity[]): ValidationStatus => {
  const config = ValidationRulesConfig.statusRules;

  if (peculiarities.length === 0) {
    return "PASS";
  }

  // Count peculiarities by severity
  const highSeverity = peculiarities.filter(
    (p) => p.severity === "HIGH"
  ).length;
  const mediumSeverity = peculiarities.filter(
    (p) => p.severity === "MEDIUM"
  ).length;

  // Check for critical failures that should FAIL validation
  const criticalIssues = peculiarities.filter(
    (p) =>
      p.type === "SIGNATURE_MISSING" ||
      p.type === "MISSING_REQUIRED_FIELD" ||
      p.type === "QUANTITY_MISMATCH" ||
      p.type === "POOR_IMAGE_QUALITY"
  );

  // Multiple HIGH severity issues should FAIL
  if (highSeverity >= 2) {
    return "FAIL";
  }

  // Critical missing signatures should FAIL
  const missingSignatures = peculiarities.filter(
    (p) => p.type === "SIGNATURE_MISSING"
  );
  if (missingSignatures.length >= 2) {
    return "FAIL";
  }

  // Single HIGH severity or multiple critical issues triggers REVIEW
  if (config.highSeverityTriggersReview && highSeverity > 0) {
    return "REVIEW";
  }

  // Multiple medium severity triggers REVIEW
  if (mediumSeverity >= config.mediumSeverityThreshold) {
    return "REVIEW";
  }

  // Any other peculiarities trigger REVIEW
  return "REVIEW";
};

/**
 * Generate Summary Message
 */
const generateSummary = (
  status: ValidationStatus,
  peculiarities: Peculiarity[],
  context: ValidationContext
): string => {
  if (status === "PASS") {
    return "POD validation passed. All checks successful.";
  }

  if (status === "FAIL") {
    return "POD validation failed. Critical issues detected.";
  }

  // REVIEW status - generate summary from peculiarities
  if (peculiarities.length === 0) {
    return "POD requires review.";
  }

  const highPriority = peculiarities.filter((p) => p.severity === "HIGH");

  if (highPriority.length > 0) {
    return `POD requires review: ${highPriority[0].description}`;
  }

  return `POD requires review: ${peculiarities[0].description}`;
};
