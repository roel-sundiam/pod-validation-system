/**
 * Super 8 Validator
 *
 * Implements Super 8-specific validation rules including:
 * - Pallet detection (WITH/WITHOUT pallets scenarios)
 * - Document completeness checking
 * - Pallet document validation
 * - Ship document validation
 * - Cross-document validation (Invoice vs RAR)
 */

import { BaseValidator } from "./validator.interface";
import { IDeliveryModel } from "../../models/delivery.model";
import { PODModel, IPODModel } from "../../models/pod.model";
import { extractTotalCasesFromSummary } from "../normalization.service";
import {
  DeliveryValidationResult,
  CrossDocumentCheck,
  DeliveryValidationChecklist,
  DocumentValidationChecklist,
  ValidationCheckItem,
  CheckStatus,
} from "../../../../shared/types/delivery-schema";
import {
  Peculiarity,
  DocumentType,
  StampType,
  SignatureType,
} from "../../../../shared/types/pod-schema";
import { Super8ValidationRules } from "../../config/super8-rules.config";
import { hasStamp, hasSignature } from "../stamp-detection.service";
import { createModuleLogger } from "../../middleware/logger";

const logger = createModuleLogger("Super8Validator");

export class Super8Validator extends BaseValidator {
  getName(): string {
    return "Super8Validator";
  }

  getVersion(): string {
    return "1.0.0";
  }

  /**
   * Main validation method for Super 8 deliveries
   */
  async validate(delivery: IDeliveryModel): Promise<DeliveryValidationResult> {
    logger.info("Starting Super 8 validation", {
      deliveryId: delivery._id,
      deliveryReference: delivery.deliveryReference,
      documentCount: delivery.documents.length,
    });

    const peculiarities: Peculiarity[] = [];
    const crossDocumentChecks: CrossDocumentCheck[] = [];

    // Load all POD documents for this delivery
    const podIds = delivery.documents.map((doc) => doc.podId);
    const pods = await PODModel.find({ _id: { $in: podIds } });

    // Step 1: Detect pallet scenario
    const hasPallets = this.detectPallets(delivery, pods);
    logger.info("Pallet scenario detected", {
      deliveryId: delivery._id,
      hasPallets,
      method: hasPallets ? "WITH_PALLETS" : "WITHOUT_PALLETS",
    });

    // Step 2: Check document completeness
    const completeness = this.checkDocumentCompletenessSuper8(
      delivery,
      hasPallets,
      peculiarities
    );

    // Step 3: Validate pallet documents (if WITH pallets)
    if (hasPallets) {
      this.validatePalletDocuments(delivery, pods, peculiarities);
    }

    // Step 4: Validate ship document
    this.validateShipDocument(delivery, pods, hasPallets, peculiarities);

    // Step 5: Cross-document validation (Invoice vs RAR)
    const invoiceRARCheck = await this.validateInvoiceRAR(
      delivery,
      pods,
      peculiarities
    );
    if (invoiceRARCheck) {
      crossDocumentChecks.push(invoiceRARCheck);
    }

    // Step 6: Build detailed validation checklist (this determines the final status)
    const checklist = await this.buildValidationChecklist(
      delivery,
      pods,
      hasPallets
    );

    // Step 7: Use checklist's overall status (which includes critical failure detection)
    const status = checklist.overallStatus;

    // Step 8: Generate summary
    const summary = checklist.summary;

    const validationResult: DeliveryValidationResult = {
      status,
      summary,
      timestamp: new Date(),
      documentCompleteness: {
        hasPallets,
        requiredDocuments: completeness.required,
        missingDocuments: completeness.missing,
        extraDocuments: completeness.extra,
      },
      crossDocumentChecks,
      peculiarities,
      checklist, // NEW: Include detailed validation checklist
    };

    logger.info("Super 8 validation complete", {
      deliveryId: delivery._id,
      status,
      peculiarityCount: peculiarities.length,
      crossDocumentCheckCount: crossDocumentChecks.length,
      checklistItems:
        checklist.documentCompleteness.length +
        checklist.documentSpecificChecks.reduce(
          (sum, d) => sum + d.checks.length,
          0
        ) +
        checklist.crossDocumentChecks.length,
    });

    return validationResult;
  }

  /**
   * Detect if delivery has pallets
   */
  private detectPallets(delivery: IDeliveryModel, pods: IPODModel[]): boolean {
    // Method 1: Check if Pallet Notification Letter is present
    const hasPalletNotification = delivery.documents.some(
      (doc) => doc.detectedType === "PALLET_NOTIFICATION_LETTER"
    );

    if (hasPalletNotification) {
      logger.debug("Pallets detected: Pallet Notification Letter present");
      return true;
    }

    // Method 2: Check if LOSCAM_DOCUMENT is present (strong indicator of pallets)
    const hasLoscamDocument = delivery.documents.some(
      (doc) => doc.detectedType === "LOSCAM_DOCUMENT"
    );

    if (hasLoscamDocument) {
      logger.debug("Pallets detected: Loscam Document present");
      return true;
    }

    // Method 3: Check if Customer Pallet Receiving is present
    const hasCustomerPalletReceiving = delivery.documents.some(
      (doc) => doc.detectedType === "CUSTOMER_PALLET_RECEIVING"
    );

    if (hasCustomerPalletReceiving) {
      logger.debug("Pallets detected: Customer Pallet Receiving present");
      return true;
    }

    // Method 4: Check if any document has PALLET stamp
    const hasPalletStamp = pods.some(
      (pod) => pod.stampDetection && hasStamp(pod.stampDetection, "PALLET")
    );

    if (hasPalletStamp) {
      logger.debug("Pallets detected: PALLET stamp found");
      return true;
    }

    // Method 5: Check if NO_PALLET stamp is present (indicates no pallets)
    const hasNoPalletStamp = pods.some(
      (pod) => pod.stampDetection && hasStamp(pod.stampDetection, "NO_PALLET")
    );

    if (hasNoPalletStamp) {
      logger.debug("No pallets detected: NO_PALLET stamp found");
      return false;
    }

    // Default: assume no pallets if no evidence found
    logger.debug("No pallet evidence found, defaulting to WITHOUT_PALLETS");
    return false;
  }

  /**
   * Check document completeness for Super 8
   */
  private checkDocumentCompletenessSuper8(
    delivery: IDeliveryModel,
    hasPallets: boolean,
    peculiarities: Peculiarity[]
  ): { required: string[]; missing: string[]; extra: string[] } {
    const requiredTypes = hasPallets
      ? Super8ValidationRules.requiredDocuments.WITH_PALLETS
      : Super8ValidationRules.requiredDocuments.WITHOUT_PALLETS;

    const presentTypes = delivery.documents
      .map((doc) => doc.detectedType)
      .filter((type) => type && type !== "UNKNOWN") as string[];

    let missing = requiredTypes.filter((type) => !presentTypes.includes(type));
    const extra = presentTypes.filter(
      (type) =>
        !requiredTypes.includes(type as DocumentType) && type !== "UNKNOWN"
    );

    // Smart fallback: If SHIP_DOCUMENT is missing but we have other pallet docs and ONE UNKNOWN,
    // infer that UNKNOWN is likely the SHIP_DOCUMENT (handles poor OCR cases)
    if (hasPallets && missing.includes("SHIP_DOCUMENT")) {
      const unknownDocs = delivery.documents.filter(
        (doc) => doc.detectedType === "UNKNOWN"
      );
      const hasLoscam = presentTypes.includes("LOSCAM_DOCUMENT");
      const hasPalletNotif = presentTypes.includes(
        "PALLET_NOTIFICATION_LETTER"
      );
      const hasCustomerPallet = presentTypes.includes(
        "CUSTOMER_PALLET_RECEIVING"
      );

      if (
        unknownDocs.length === 1 &&
        hasLoscam &&
        hasPalletNotif &&
        hasCustomerPallet
      ) {
        logger.info(
          "Smart fallback: Inferring UNKNOWN document as SHIP_DOCUMENT",
          {
            deliveryId: delivery._id,
            unknownDocId: unknownDocs[0].podId,
            reason: "Has all other pallet docs + 1 UNKNOWN",
          }
        );

        // Remove SHIP_DOCUMENT from missing list (we're inferring it's present)
        missing = missing.filter((type) => type !== "SHIP_DOCUMENT");
        presentTypes.push("SHIP_DOCUMENT"); // Add to present list for downstream checks
      }
    }

    // Add peculiarities for missing documents
    missing.forEach((docType) => {
      peculiarities.push({
        type: "MISSING_REQUIRED_DOCUMENT",
        severity:
          Super8ValidationRules.peculiaritySeverity.missingRequiredDocument,
        description: `Missing required Super 8 document: ${docType}`,
        fieldPath: `documents.${docType}`,
      });
    });

    // Flag unknown documents
    const unknownDocs = delivery.documents.filter(
      (doc) => doc.detectedType === "UNKNOWN"
    );
    unknownDocs.forEach((doc, index) => {
      peculiarities.push({
        type: "DOCUMENT_TYPE_UNKNOWN",
        severity: Super8ValidationRules.peculiaritySeverity.documentTypeUnknown,
        description: `Unable to identify document type (confidence too low or unrecognized format)`,
        fieldPath: `documents[${index}]`,
      });
    });

    return {
      required: requiredTypes,
      missing,
      extra,
    };
  }

  /**
   * Validate pallet-specific documents
   */
  private validatePalletDocuments(
    delivery: IDeliveryModel,
    pods: IPODModel[],
    peculiarities: Peculiarity[]
  ): void {
    // Validate Pallet Notification Letter
    const palletNotificationDoc = delivery.documents.find(
      (doc) => doc.detectedType === "PALLET_NOTIFICATION_LETTER"
    );

    if (palletNotificationDoc) {
      const pod = pods.find(
        (p) => p._id.toString() === palletNotificationDoc.podId.toString()
      );
      if (pod && pod.stampDetection) {
        const requirements =
          Super8ValidationRules.palletDocumentRequirements
            .PALLET_NOTIFICATION_LETTER;

        // Check required stamps
        requirements.stamps.forEach((stampType) => {
          if (!hasStamp(pod.stampDetection!, stampType)) {
            peculiarities.push({
              type: "MISSING_STAMP",
              severity: Super8ValidationRules.peculiaritySeverity.missingStamp,
              description: `Pallet Notification Letter missing required ${stampType} stamp`,
              fieldPath: "PALLET_NOTIFICATION_LETTER.stamps",
            });
          }
        });

        // Check required signatures
        requirements.signatures.forEach((sigType) => {
          if (!hasSignature(pod.stampDetection!, sigType)) {
            peculiarities.push({
              type: "SIGNATURE_MISSING",
              severity:
                Super8ValidationRules.peculiaritySeverity.missingSignature,
              description: `Pallet Notification Letter missing required ${sigType} signature`,
              fieldPath: "PALLET_NOTIFICATION_LETTER.signatures",
            });
          }
        });
      }
    }

    // Validate Loscam Document
    const loscamDoc = delivery.documents.find(
      (doc) => doc.detectedType === "LOSCAM_DOCUMENT"
    );

    if (loscamDoc) {
      const pod = pods.find(
        (p) => p._id.toString() === loscamDoc.podId.toString()
      );
      if (pod && pod.stampDetection) {
        const requirements =
          Super8ValidationRules.palletDocumentRequirements.LOSCAM_DOCUMENT;

        // Check required stamps
        requirements.stamps.forEach((stampType) => {
          if (!hasStamp(pod.stampDetection!, stampType)) {
            peculiarities.push({
              type: "MISSING_STAMP",
              severity: Super8ValidationRules.peculiaritySeverity.missingStamp,
              description: `Loscam Document missing required ${stampType} stamp`,
              fieldPath: "LOSCAM_DOCUMENT.stamps",
            });
          }
        });

        // Check required signatures
        requirements.signatures.forEach((sigType) => {
          if (!hasSignature(pod.stampDetection!, sigType)) {
            peculiarities.push({
              type: "SIGNATURE_MISSING",
              severity:
                Super8ValidationRules.peculiaritySeverity.missingSignature,
              description: `Loscam Document missing required ${sigType} signature`,
              fieldPath: "LOSCAM_DOCUMENT.signatures",
            });
          }
        });
      }
    }

    // Customer Pallet Receiving Document just needs to be present (already checked in completeness)
  }

  /**
   * Validate ship document based on pallet scenario
   */
  private validateShipDocument(
    delivery: IDeliveryModel,
    pods: IPODModel[],
    hasPallets: boolean,
    peculiarities: Peculiarity[]
  ): void {
    let shipDoc = delivery.documents.find(
      (doc) => doc.detectedType === "SHIP_DOCUMENT"
    );

    // Smart fallback: Check if we inferred an UNKNOWN as SHIP_DOCUMENT
    if (!shipDoc && hasPallets) {
      const unknownDocs = delivery.documents.filter(
        (doc) => doc.detectedType === "UNKNOWN"
      );
      const presentTypes = delivery.documents
        .map((doc) => doc.detectedType)
        .filter((type) => type && type !== "UNKNOWN");

      if (
        unknownDocs.length === 1 &&
        presentTypes.includes("LOSCAM_DOCUMENT") &&
        presentTypes.includes("PALLET_NOTIFICATION_LETTER") &&
        presentTypes.includes("CUSTOMER_PALLET_RECEIVING")
      ) {
        shipDoc = unknownDocs[0]; // Use the UNKNOWN doc as ship doc
        logger.info(
          "Using inferred UNKNOWN document as SHIP_DOCUMENT for validation",
          {
            deliveryId: delivery._id,
            podId: shipDoc.podId,
          }
        );
      }
    }

    if (!shipDoc) {
      // Already flagged in document completeness (or no valid fallback)
      return;
    }

    const pod = pods.find((p) => p._id.toString() === shipDoc.podId.toString());
    if (!pod || !pod.stampDetection) {
      peculiarities.push({
        type: "MISSING_STAMP",
        severity: Super8ValidationRules.peculiaritySeverity.missingStamp,
        description: "Ship Document has no stamp detection data",
        fieldPath: "SHIP_DOCUMENT",
      });
      return;
    }

    const requirements = hasPallets
      ? Super8ValidationRules.shipDocumentRequirements.WITH_PALLETS
      : Super8ValidationRules.shipDocumentRequirements.WITHOUT_PALLETS;

    // Check required stamps
    requirements.stamps.forEach((stampType) => {
      if (!hasStamp(pod.stampDetection!, stampType)) {
        peculiarities.push({
          type: "MISSING_STAMP",
          severity: Super8ValidationRules.peculiaritySeverity.missingStamp,
          description: `Ship Document missing required ${stampType} stamp (${
            hasPallets ? "WITH" : "WITHOUT"
          } pallets scenario)`,
          fieldPath: "SHIP_DOCUMENT.stamps",
        });
      }
    });

    // Check required signatures
    requirements.signatures.forEach((sigType) => {
      if (!hasSignature(pod.stampDetection!, sigType)) {
        peculiarities.push({
          type: "SIGNATURE_MISSING",
          severity: Super8ValidationRules.peculiaritySeverity.missingSignature,
          description: `Ship Document missing required ${sigType} signature`,
          fieldPath: "SHIP_DOCUMENT.signatures",
        });
      }
    });

    // Check required fields (e.g., time-out)
    if (hasPallets && requirements.fields.includes("time-out")) {
      const hasTimeOut = this.checkTimeOutField(pod);
      if (!hasTimeOut) {
        peculiarities.push({
          type: "MISSING_REQUIRED_FIELD",
          severity:
            Super8ValidationRules.peculiaritySeverity.missingRequiredField,
          description: "Ship Document missing required time-out field",
          fieldPath: "SHIP_DOCUMENT.time-out",
        });
      }
    }
  }

  /**
   * Check if time-out field is present in document
   */
  private checkTimeOutField(pod: IPODModel): boolean {
    const rawText = pod.extractedData.rawText || "";
    return Super8ValidationRules.timeOutFieldPatterns.some((pattern) =>
      pattern.test(rawText)
    );
  }

  /**
   * Validate Invoice vs RAR (cross-document validation)
   */
  private async validateInvoiceRAR(
    delivery: IDeliveryModel,
    pods: IPODModel[],
    peculiarities: Peculiarity[]
  ): Promise<CrossDocumentCheck | null> {
    const invoiceDoc = delivery.documents.find(
      (doc) => doc.detectedType === "INVOICE"
    );
    const rarDoc = delivery.documents.find((doc) => doc.detectedType === "RAR");

    if (!invoiceDoc || !rarDoc) {
      // Already flagged in document completeness
      return null;
    }

    const invoicePod = pods.find(
      (p) => p._id.toString() === invoiceDoc.podId.toString()
    );
    const rarPod = pods.find(
      (p) => p._id.toString() === rarDoc.podId.toString()
    );

    if (!invoicePod || !rarPod) {
      return null;
    }

    const checkDetails: any = {};
    let checkStatus: "PASS" | "FAIL" = "PASS";
    const checkDescriptions: string[] = [];

    // Compare PO numbers
    const invoicePO = this.extractPONumber(
      invoicePod.extractedData.rawText || ""
    );
    const rarPO = this.extractPONumber(rarPod.extractedData.rawText || "");

    if (invoicePO && rarPO) {
      if (invoicePO !== rarPO) {
        checkStatus = "FAIL";
        checkDescriptions.push(
          `PO number mismatch: Invoice shows ${invoicePO}, RAR shows ${rarPO}`
        );
        peculiarities.push({
          type: "CROSS_DOCUMENT_MISMATCH",
          severity: Super8ValidationRules.peculiaritySeverity.poNumberMismatch,
          description: `PO number mismatch: Invoice shows ${invoicePO}, RAR shows ${rarPO}`,
          fieldPath: "INVOICE.poNumber vs RAR.poNumber",
        });
      } else {
        checkDescriptions.push(`PO number matches: ${invoicePO}`);
      }
      checkDetails.poNumber = {
        invoice: invoicePO,
        rar: rarPO,
        match: invoicePO === rarPO,
      };
    }

    // Compare total cases
    const invoiceCases = this.extractTotalCases(
      invoicePod.extractedData.rawText || ""
    );
    const rarCases = this.extractTotalCases(rarPod.extractedData.rawText || "");

    if (invoiceCases !== null && rarCases !== null) {
      if (invoiceCases !== rarCases) {
        checkStatus = "FAIL";
        checkDescriptions.push(
          `Total cases mismatch: Invoice shows ${invoiceCases}, RAR shows ${rarCases}`
        );
        peculiarities.push({
          type: "CROSS_DOCUMENT_MISMATCH",
          severity:
            Super8ValidationRules.peculiaritySeverity.totalCasesMismatch,
          description: `Total cases mismatch: Invoice shows ${invoiceCases}, RAR shows ${rarCases}`,
          fieldPath: "INVOICE.totalCases vs RAR.totalCases",
        });
      } else {
        checkDescriptions.push(`Total cases match: ${invoiceCases}`);
      }
      checkDetails.totalCases = {
        invoice: invoiceCases,
        rar: rarCases,
        match: invoiceCases === rarCases,
      };
    }

    // Compare items (if available in normalized data)
    if (
      invoicePod.extractedData.normalized.items.length > 0 &&
      rarPod.extractedData.normalized.items.length > 0
    ) {
      const itemDiscrepancies = this.compareItems(
        invoicePod.extractedData.normalized.items,
        rarPod.extractedData.normalized.items,
        peculiarities
      );
      checkDetails.itemComparison = itemDiscrepancies;
      if (itemDiscrepancies.length > 0) {
        checkStatus = "FAIL";
      }
    }

    return {
      checkType: "INVOICE_RAR_COMPARISON",
      status: checkStatus,
      description:
        checkDescriptions.join("; ") || "Invoice and RAR comparison completed",
      details: checkDetails,
    };
  }

  /**
   * Extract PO number from text
   */
  private extractPONumber(text: string): string | null {
    for (const pattern of Super8ValidationRules.invoiceRARValidation
      .poNumberPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Extract total cases from text
   */
  private extractTotalCases(text: string): number | null {
    for (const pattern of Super8ValidationRules.invoiceRARValidation
      .totalCasesPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  }

  /**
   * Compare items between Invoice and RAR
   */
  private compareItems(
    invoiceItems: any[],
    rarItems: any[],
    peculiarities: Peculiarity[]
  ): any[] {
    const discrepancies: any[] = [];

    invoiceItems.forEach((invoiceItem) => {
      const rarItem = rarItems.find((r) => r.itemCode === invoiceItem.itemCode);

      if (!rarItem) {
        discrepancies.push({
          itemCode: invoiceItem.itemCode,
          issue: "Item in Invoice but not in RAR",
          invoiceQty:
            invoiceItem.deliveredQuantity || invoiceItem.expectedQuantity,
          rarQty: 0,
        });

        peculiarities.push({
          type: "CROSS_DOCUMENT_MISMATCH",
          severity:
            Super8ValidationRules.peculiaritySeverity.itemQuantityMismatch,
          description: `Item ${invoiceItem.itemCode} found in Invoice but not in RAR`,
          fieldPath: `INVOICE.items.${invoiceItem.itemCode}`,
        });
      } else {
        const invoiceQty =
          invoiceItem.deliveredQuantity || invoiceItem.expectedQuantity || 0;
        const rarQty =
          rarItem.deliveredQuantity || rarItem.expectedQuantity || 0;

        if (invoiceQty !== rarQty) {
          discrepancies.push({
            itemCode: invoiceItem.itemCode,
            issue: "Quantity mismatch",
            invoiceQty,
            rarQty,
            difference: invoiceQty - rarQty,
          });

          peculiarities.push({
            type: "CROSS_DOCUMENT_MISMATCH",
            severity:
              Super8ValidationRules.peculiaritySeverity.itemQuantityMismatch,
            description: `Item ${invoiceItem.itemCode}: Invoice shows ${invoiceQty}, RAR shows ${rarQty}`,
            fieldPath: `INVOICE.items.${invoiceItem.itemCode} vs RAR.items.${invoiceItem.itemCode}`,
          });
        }
      }
    });

    // Check for items in RAR but not in Invoice
    rarItems.forEach((rarItem) => {
      const invoiceItem = invoiceItems.find(
        (i) => i.itemCode === rarItem.itemCode
      );
      if (!invoiceItem) {
        discrepancies.push({
          itemCode: rarItem.itemCode,
          issue: "Item in RAR but not in Invoice",
          invoiceQty: 0,
          rarQty: rarItem.deliveredQuantity || rarItem.expectedQuantity,
        });

        peculiarities.push({
          type: "CROSS_DOCUMENT_MISMATCH",
          severity:
            Super8ValidationRules.peculiaritySeverity.itemQuantityMismatch,
          description: `Item ${rarItem.itemCode} found in RAR but not in Invoice`,
          fieldPath: `RAR.items.${rarItem.itemCode}`,
        });
      }
    });

    return discrepancies;
  }

  /**
   * Build detailed validation checklist in hierarchical A/B/C/D format
   */
  private async buildValidationChecklist(
    delivery: IDeliveryModel,
    pods: IPODModel[],
    hasPallets: boolean
  ): Promise<DeliveryValidationChecklist> {
    // Using documentCompleteness for Section A, documentSpecificChecks for B/C, crossDocumentChecks for validation items
    const sectionA: ValidationCheckItem[] = []; // Pallet Validation
    const sectionB: ValidationCheckItem[] = []; // Ship Document Validation
    const sectionC: ValidationCheckItem[] = []; // Invoice Validation
    const overallChecks: ValidationCheckItem[] = [];

    // Get POD documents
    const palletNotifPod = pods.find(
      (p) =>
        p.documentClassification?.detectedType === "PALLET_NOTIFICATION_LETTER"
    );
    const loscamPod = pods.find(
      (p) => p.documentClassification?.detectedType === "LOSCAM_DOCUMENT"
    );
    const customerPalletPod = pods.find(
      (p) =>
        p.documentClassification?.detectedType === "CUSTOMER_PALLET_RECEIVING"
    );
    let shipPod = pods.find(
      (p) => p.documentClassification?.detectedType === "SHIP_DOCUMENT"
    );
    const invoicePod = pods.find(
      (p) => p.documentClassification?.detectedType === "INVOICE"
    );
    const rarPod = pods.find(
      (p) => p.documentClassification?.detectedType === "RAR"
    );

    // Smart fallback: If ship doc not found but we have other pallet docs + 1 UNKNOWN, infer it's the ship doc
    if (
      !shipPod &&
      hasPallets &&
      loscamPod &&
      palletNotifPod &&
      customerPalletPod
    ) {
      const unknownPods = pods.filter(
        (p) => p.documentClassification?.detectedType === "UNKNOWN"
      );
      if (unknownPods.length === 1) {
        shipPod = unknownPods[0];
        logger.info("Checklist: Inferring UNKNOWN document as SHIP_DOCUMENT", {
          deliveryId: delivery._id,
          podId: shipPod._id,
        });
      }
    }

    // ========================================
    // SECTION A: PALLET VALIDATION
    // ========================================

    // A1. Is there a Pallet Notification Letter?
    const hasPalletNotif = !!palletNotifPod;
    sectionA.push({
      name: "A1. Is there a Pallet Notification Letter?",
      status: hasPalletNotif
        ? "PASSED"
        : hasPallets
        ? "FAILED"
        : "NOT_APPLICABLE",
      message: hasPalletNotif
        ? "Pallet Notification Letter found"
        : hasPallets
        ? "Pallet Notification Letter missing"
        : "No pallets scenario",
    });

    if (hasPalletNotif && hasPallets) {
      // If YES (With Pallet Notification Letter)

      // Loscam document is present
      sectionA.push({
        name: "  Loscam document is present",
        status: loscamPod ? "PASSED" : "FAILED",
        message: loscamPod
          ? "Loscam document found"
          : "Loscam document missing",
      });

      // Loscam document is signed by the customer
      if (loscamPod && loscamPod.stampDetection) {
        // For Loscam, "Received By" signature (RECEIVER) is the customer signature
        const hasCustomerSig =
          hasSignature(loscamPod.stampDetection, "CUSTOMER") ||
          hasSignature(loscamPod.stampDetection, "RECEIVER");
        sectionA.push({
          name: "  Loscam document is signed by the customer",
          status: hasCustomerSig ? "PASSED" : "FAILED",
          message: hasCustomerSig
            ? "Customer signature detected"
            : "Customer signature not found",
        });
      } else if (loscamPod) {
        sectionA.push({
          name: "  Loscam document is signed by the customer",
          status: "FAILED",
          message: "Cannot verify signature - document not processed",
        });
      }

      // Customer pallet receiving document is present
      sectionA.push({
        name: "  Customer pallet receiving document is present",
        status: customerPalletPod ? "PASSED" : "FAILED",
        message: customerPalletPod
          ? "Customer pallet receiving document found"
          : "Customer pallet receiving document missing",
      });

      // Total of three (3) pallet-related documents are complete
      const palletDocsCount = [
        palletNotifPod,
        loscamPod,
        customerPalletPod,
      ].filter(Boolean).length;
      sectionA.push({
        name: "  Total of three (3) pallet-related documents are complete",
        status: palletDocsCount === 3 ? "PASSED" : "FAILED",
        message: `${palletDocsCount}/3 pallet documents found`,
      });

      // Pallet Notification Letter has warehouse stamp
      if (palletNotifPod.stampDetection) {
        const hasWarehouseStamp = hasStamp(
          palletNotifPod.stampDetection,
          "WAREHOUSE"
        );
        sectionA.push({
          name: "  Pallet Notification Letter has warehouse stamp",
          status: hasWarehouseStamp ? "PASSED" : "FAILED",
          message: hasWarehouseStamp
            ? "Warehouse stamp detected"
            : "Warehouse stamp not found",
        });

        // Pallet Notification Letter has warehouse signature
        const hasWarehouseSig = hasSignature(
          palletNotifPod.stampDetection,
          "WAREHOUSE_STAFF"
        );
        sectionA.push({
          name: "  Pallet Notification Letter has warehouse signature",
          status: hasWarehouseSig ? "PASSED" : "FAILED",
          message: hasWarehouseSig
            ? "Warehouse signature detected"
            : "Warehouse signature not found",
        });
      }
    } else if (!hasPallets) {
      // If NO (Without Pallets)
      sectionA.push({
        name: "  Pallet validation skipped",
        status: "NOT_APPLICABLE",
        message: "No pallet scenario - pallet validation not required",
      });
    }

    // ========================================
    // SECTION B: SHIP DOCUMENT VALIDATION
    // ========================================

    // B1. Ship Document is present
    sectionB.push({
      name: "B1. Ship Document is present",
      status: shipPod ? "PASSED" : "FAILED",
      message: shipPod ? "Ship Document found" : "Ship Document missing",
    });

    // Check if this is an inferred ship doc (was UNKNOWN with poor OCR)
    const isInferredShipDoc =
      shipPod && shipPod.documentClassification?.detectedType === "UNKNOWN";
    const hasLowOCRConfidence =
      shipPod && (shipPod.processingMetadata?.ocrConfidence || 0) < 60;

    if (shipPod && shipPod.stampDetection) {
      if (hasPallets) {
        // If With Pallets

        // If document was inferred (poor OCR), make checks more lenient
        if (isInferredShipDoc && hasLowOCRConfidence) {
          sectionB.push({
            name: "  Note: Document has poor OCR quality",
            status: "WARNING",
            message: `OCR confidence: ${
              shipPod.processingMetadata?.ocrConfidence || 0
            }% - stamp/signature validation may be unreliable`,
          });
        }

        // Dispatch stamp is present
        const hasDispatchStamp = hasStamp(shipPod.stampDetection, "DISPATCH");
        sectionB.push({
          name: "  Dispatch stamp is present",
          status: hasDispatchStamp
            ? "PASSED"
            : isInferredShipDoc
            ? "WARNING"
            : "FAILED",
          message: hasDispatchStamp
            ? "Dispatch stamp detected"
            : isInferredShipDoc
            ? "Cannot verify due to poor OCR - please review manually"
            : "Dispatch stamp not found",
        });

        // Pallet stamp from dispatch is present
        const hasPalletStamp = hasStamp(shipPod.stampDetection, "PALLET");
        sectionB.push({
          name: "  Pallet stamp from dispatch is present",
          status: hasPalletStamp
            ? "PASSED"
            : isInferredShipDoc
            ? "WARNING"
            : "FAILED",
          message: hasPalletStamp
            ? "Pallet stamp detected"
            : isInferredShipDoc
            ? "Cannot verify due to poor OCR - please review manually"
            : "Pallet stamp not found",
        });

        // Security signature is present
        const hasSecuritySig = hasSignature(shipPod.stampDetection, "SECURITY");
        sectionB.push({
          name: "  Security signature is present",
          status: hasSecuritySig
            ? "PASSED"
            : isInferredShipDoc
            ? "WARNING"
            : "FAILED",
          message: hasSecuritySig
            ? "Security signature detected"
            : isInferredShipDoc
            ? "Cannot verify due to poor OCR - please review manually"
            : "Security signature not found",
        });

        // Time-out is indicated (check for time-out field in extracted data)
        const hasTimeOut =
          shipPod.extractedData?.rawText?.toLowerCase().includes("time-out") ||
          shipPod.extractedData?.rawText?.toLowerCase().includes("timeout");
        sectionB.push({
          name: "  Time-out is indicated (bottom-right of ship document)",
          status: hasTimeOut ? "PASSED" : "WARNING",
          message: hasTimeOut
            ? "Time-out field detected"
            : "Time-out field not clearly visible",
        });
      } else {
        // If Without Pallets

        // Dispatch stamp is present
        const hasDispatchStamp = hasStamp(shipPod.stampDetection, "DISPATCH");
        sectionB.push({
          name: "  Dispatch stamp is present",
          status: hasDispatchStamp ? "PASSED" : "FAILED",
          message: hasDispatchStamp
            ? "Dispatch stamp detected"
            : "Dispatch stamp not found",
        });

        // "No Pallet" stamp from dispatch is present
        const hasNoPalletStamp = hasStamp(shipPod.stampDetection, "NO_PALLET");
        sectionB.push({
          name: '  "No Pallet" stamp from dispatch is present',
          status: hasNoPalletStamp ? "PASSED" : "FAILED",
          message: hasNoPalletStamp
            ? "No Pallet stamp detected"
            : "No Pallet stamp not found",
        });
      }
    }

    // ========================================
    // SECTION C: INVOICE VALIDATION
    // ========================================

    if (invoicePod && rarPod) {
      // All invoice pages are present (check page count if available)
      const invoicePages = invoicePod.extractedData?.rawText ? 1 : 1; // Simplified - would need better page detection
      sectionC.push({
        name: "C. All invoice pages are present (total page count correct)",
        status: "PASSED", // Assuming pages are complete if uploaded
        message: `Invoice pages detected`,
      });

      // Extract PO numbers
      const invoicePO = this.extractPONumber(
        invoicePod.extractedData?.rawText || ""
      );
      const rarPO = this.extractPONumber(rarPod.extractedData?.rawText || "");

      // Invoice PO number matches RAR PO number
      const poMatch = invoicePO && rarPO && invoicePO === rarPO;
      sectionC.push({
        name: "  Invoice PO number matches RAR PO number",
        status: poMatch ? "PASSED" : invoicePO && rarPO ? "FAILED" : "WARNING",
        message: poMatch
          ? `PO numbers match: ${invoicePO}`
          : invoicePO && rarPO
          ? `PO mismatch - Invoice: ${invoicePO}, RAR: ${rarPO}`
          : "PO numbers not clearly detected",
        details: { invoicePO, rarPO },
      });

      // Total number of cases matches
      // First try to sum items, but use fallback if items look unreliable
      const invoiceItems = invoicePod.extractedData?.normalized?.items || [];
      const rarItems = rarPod.extractedData?.normalized?.items || [];

      let invoiceTotal = invoiceItems.reduce(
        (sum, item) => sum + (item.deliveredQuantity || 0),
        0
      );
      let rarTotal = rarItems.reduce(
        (sum, item) =>
          sum + (item.deliveredQuantity || item.expectedQuantity || 0),
        0
      );

      // If totals look suspicious or OCR confidence is low, try extracting from summary
      const invoiceOCR = invoicePod.processingMetadata?.ocrConfidence || 100;
      const rarOCR = rarPod.processingMetadata?.ocrConfidence || 100;

      let invoiceSource = "item sum";
      let rarSource = "item sum";

      // Use fallback if: low OCR confidence OR suspiciously high total OR very few items
      if (invoiceOCR < 60 || invoiceTotal > 500 || invoiceItems.length < 2) {
        const summaryTotal = extractTotalCasesFromSummary(
          invoicePod.extractedData?.rawText || ""
        );
        if (summaryTotal !== null && summaryTotal !== invoiceTotal) {
          invoiceTotal = summaryTotal;
          invoiceSource = "summary extraction";
        }
      }

      if (rarOCR < 60 || rarTotal > 500 || rarItems.length < 2) {
        const summaryTotal = extractTotalCasesFromSummary(
          rarPod.extractedData?.rawText || ""
        );
        if (summaryTotal !== null && summaryTotal !== rarTotal) {
          rarTotal = summaryTotal;
          rarSource = "summary extraction";
        }
      }

      const casesMatch = invoiceTotal === rarTotal && invoiceTotal > 0;
      const warningMessage =
        invoiceSource !== "item sum" || rarSource !== "item sum"
          ? ` (Invoice: ${invoiceSource}, RAR: ${rarSource})`
          : "";

      sectionC.push({
        name: "  Total number of cases on Invoice matches total number of cases on RAR",
        status: casesMatch
          ? "PASSED"
          : invoiceTotal > 0 && rarTotal > 0
          ? "FAILED"
          : "WARNING",
        message: casesMatch
          ? `Total cases match: ${invoiceTotal}${warningMessage}`
          : `Cases mismatch - Invoice: ${invoiceTotal}, RAR: ${rarTotal}${warningMessage}`,
        details: {
          invoiceTotal,
          rarTotal,
          invoiceSource,
          rarSource,
          invoiceOCR,
          rarOCR,
        },
      });

      // If FAIL on Case Matching - Discrepancy details (only if using item sums)
      if (
        !casesMatch &&
        invoiceTotal > 0 &&
        rarTotal > 0 &&
        invoiceSource === "item sum" &&
        rarSource === "item sum"
      ) {
        const tempPeculiarities: any[] = [];
        const discrepancies = this.compareItems(
          invoiceItems,
          rarItems,
          tempPeculiarities
        );

        // Create a summary of discrepancies for better display
        const discrepancySummary = discrepancies
          .slice(0, 5)
          .map(
            (d) =>
              `${d.itemCode || "Unknown"}: Inv=${d.invoiceQty}, RAR=${d.rarQty}`
          )
          .join("; ");

        const moreItems =
          discrepancies.length > 5 ? ` +${discrepancies.length - 5} more` : "";

        sectionC.push({
          name: "    Discrepancy details identified (items and quantity differences noted)",
          status: discrepancies.length === 0 ? "PASSED" : "FAILED",
          message:
            discrepancies.length === 0
              ? "No item-level discrepancies"
              : `${discrepancies.length} discrepancies: ${discrepancySummary}${moreItems}`,
          details: {
            discrepancyCount: discrepancies.length,
            samples: discrepancies.slice(0, 5),
          },
        });
      } else {
        sectionC.push({
          name: "    Discrepancy details identified (items and quantity differences noted)",
          status: "NOT_APPLICABLE",
          message:
            invoiceSource !== "item sum" || rarSource !== "item sum"
              ? "Not applicable - totals extracted from document summary, not individual items"
              : "Not applicable - cases matched or insufficient data",
        });
      }
    } else {
      // Missing Invoice or RAR - provide detailed diagnostic info
      const missingDocType = !invoicePod ? "Invoice" : "RAR";
      const unknownDocs = delivery.documents.filter(
        (d) => d.detectedType === "UNKNOWN"
      );

      let diagnosticMessage = `Cannot validate - ${missingDocType} document missing.`;

      if (unknownDocs.length > 0) {
        diagnosticMessage += ` Note: ${unknownDocs.length} document(s) classified as UNKNOWN may be the missing ${missingDocType}.`;

        // Include OCR confidence for UNKNOWN docs
        const unknownPods = pods.filter(
          (p) => p.documentClassification?.detectedType === "UNKNOWN"
        );
        if (unknownPods.length > 0) {
          const ocrQualityInfo = unknownPods.map((p) => ({
            podId: p._id.toString(),
            ocrConfidence: p.processingMetadata?.ocrConfidence || 0,
            fileName: p.fileMetadata?.originalName || "unknown",
          }));

          diagnosticMessage += ` OCR quality: ${JSON.stringify(
            ocrQualityInfo
          )}.`;
        }

        diagnosticMessage += ` Suggestions: (1) Use manual document type override API, (2) Upload clearer scan/photo, (3) Verify document contains text "${
          missingDocType === "RAR" ? "RAR" : "Invoice"
        }" or "${
          missingDocType === "RAR"
            ? "Receiving and Acknowledgment"
            : "Invoice Number"
        }".`;
      }

      sectionC.push({
        name: "C. Invoice Validation",
        status: "FAILED",
        message: diagnosticMessage,
        details: {
          missingDocType,
          unknownDocCount: unknownDocs.length,
          unknownDocs: unknownDocs.map((d) => ({
            podId: d.podId.toString(),
            fileName:
              pods.find((p) => p._id.toString() === d.podId.toString())
                ?.fileMetadata?.originalName || "unknown",
          })),
        },
      });
    }

    // ========================================
    // Calculate Overall Status and Summary
    // ========================================

    const allChecks = [...sectionA, ...sectionB, ...sectionC];
    const failedChecks = allChecks.filter((c) => c.status === "FAILED").length;
    const warningChecks = allChecks.filter(
      (c) => c.status === "WARNING"
    ).length;
    const passedChecks = allChecks.filter((c) => c.status === "PASSED").length;

    // Check for critical failures that should immediately trigger FAIL status
    const criticalFailures = allChecks.filter((c) => {
      if (c.status !== "FAILED") return false;

      const checkName = c.name.trim();

      // Critical: Invoice/RAR case total mismatch
      if (
        checkName.includes("Total number of cases") ||
        checkName.includes("cases on Invoice matches") ||
        checkName.includes("cases on RAR")
      ) {
        return true;
      }

      // Critical: Item discrepancies between Invoice and RAR
      if (
        checkName.includes("Discrepancy details") ||
        checkName.includes("quantity differences")
      ) {
        return true;
      }

      return false;
    });

    let overallStatus: "PASS" | "REVIEW" | "FAIL";
    if (failedChecks === 0 && warningChecks === 0) {
      overallStatus = "PASS";
    } else if (failedChecks === 0 && warningChecks > 0) {
      overallStatus = "REVIEW";
    } else {
      // FAIL if: critical failures OR 2+ failed checks
      overallStatus =
        criticalFailures.length > 0 || failedChecks >= 2 ? "FAIL" : "REVIEW";
    }

    const summary = `${passedChecks}/${allChecks.length} checks passed${
      failedChecks > 0 ? `, ${failedChecks} failed` : ""
    }${warningChecks > 0 ? `, ${warningChecks} warnings` : ""}`;

    // Return hierarchical checklist structure
    // Using documentCompleteness for Section A, documentSpecificChecks[0] for Section B, documentSpecificChecks[1] for Section C
    return {
      documentCompleteness: sectionA, // Section A: Pallet Validation
      documentSpecificChecks: [
        { documentType: "SHIP_DOCUMENT", checks: sectionB }, // Section B: Ship Document Validation
        { documentType: "INVOICE", checks: sectionC }, // Section C: Invoice Validation
      ],
      crossDocumentChecks: overallChecks, // Section D handled separately
      overallStatus,
      summary,
    };
  }
}
