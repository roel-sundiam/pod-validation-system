import mongoose, { Schema, Document } from "mongoose";
import {
  DeliveryDocument as IDeliveryDocument,
  DeliveryStatus,
  DeliveryValidationResult,
  CrossDocumentCheck,
  DocumentCompleteness,
} from "../../../shared/types/delivery-schema";
import {
  ValidationStatus,
  DocumentType,
  PeculiarityType,
  SeverityLevel,
} from "../../../shared/types/pod-schema";

/**
 * Delivery Document Interface for Mongoose
 */
export interface IDeliveryModel
  extends Omit<IDeliveryDocument, "_id">,
    Document {}

/**
 * Document Reference Schema
 */
const DeliveryDocumentRefSchema = new Schema(
  {
    podId: { type: Schema.Types.ObjectId, ref: "POD", required: true },
    detectedType: {
      type: String,
      enum: [
        "PALLET_NOTIFICATION_LETTER",
        "LOSCAM_DOCUMENT",
        "CUSTOMER_PALLET_RECEIVING",
        "SHIP_DOCUMENT",
        "INVOICE",
        "RAR",
        "UNKNOWN",
      ] as DocumentType[],
    },
    classificationConfidence: { type: Number },
    required: { type: Boolean, default: true },
  },
  { _id: false }
);

/**
 * Document Completeness Schema
 */
const DocumentCompletenessSchema = new Schema(
  {
    hasPallets: { type: Boolean },
    requiredDocuments: { type: [String], default: [] },
    missingDocuments: { type: [String], default: [] },
    extraDocuments: { type: [String], default: [] },
  },
  { _id: false }
);

/**
 * Cross-Document Check Schema
 */
const CrossDocumentCheckSchema = new Schema(
  {
    checkType: { type: String, required: true },
    status: {
      type: String,
      enum: ["PASS", "FAIL"],
      required: true,
    },
    description: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

/**
 * Peculiarity Schema (reused from POD)
 */
const PeculiaritySchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "SIGNATURE_MISSING",
        "POOR_IMAGE_QUALITY",
        "QUANTITY_MISMATCH",
        "MISSING_REQUIRED_FIELD",
        "TEMPLATE_UNKNOWN",
        "HANDWRITTEN_NOTES",
        "MISSING_REQUIRED_DOCUMENT",
        "CROSS_DOCUMENT_MISMATCH",
        "DOCUMENT_TYPE_UNKNOWN",
        "MISSING_STAMP",
        "CONFLICTING_INFORMATION",
      ] as PeculiarityType[],
      required: true,
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"] as SeverityLevel[],
      required: true,
    },
    description: { type: String, required: true },
    fieldPath: { type: String },
  },
  { _id: false }
);

/**
 * Validation Check Item Schema (for checklist)
 */
const ValidationCheckItemSchema = new Schema(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["PASSED", "FAILED", "NOT_APPLICABLE", "WARNING"],
      required: true,
    },
    message: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

/**
 * Document Validation Checklist Schema
 */
const DocumentValidationChecklistSchema = new Schema(
  {
    documentType: { type: String, required: true },
    podId: { type: String },
    checks: { type: [ValidationCheckItemSchema], default: [] },
  },
  { _id: false }
);

/**
 * Delivery Validation Checklist Schema
 */
const DeliveryValidationChecklistSchema = new Schema(
  {
    documentCompleteness: { type: [ValidationCheckItemSchema], default: [] },
    documentSpecificChecks: {
      type: [DocumentValidationChecklistSchema],
      default: [],
    },
    crossDocumentChecks: { type: [ValidationCheckItemSchema], default: [] },
    overallStatus: {
      type: String,
      enum: ["PASS", "FAIL", "REVIEW"],
      required: true,
    },
    summary: { type: String, required: true },
  },
  { _id: false }
);

/**
 * Delivery Validation Result Schema
 */
const DeliveryValidationResultSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["PASS", "FAIL", "REVIEW"] as ValidationStatus[],
      required: true,
    },
    summary: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    documentCompleteness: { type: DocumentCompletenessSchema, required: true },
    crossDocumentChecks: { type: [CrossDocumentCheckSchema], default: [] },
    peculiarities: { type: [PeculiaritySchema], default: [] },
    checklist: { type: DeliveryValidationChecklistSchema }, // NEW: Add checklist field
  },
  { _id: false }
);

/**
 * Delivery Processing Metadata Schema
 */
const DeliveryProcessingMetadataSchema = new Schema(
  {
    processedAt: { type: Date, required: true },
    processingTimeMs: { type: Number, required: true },
    documentsProcessed: { type: Number, required: true, default: 0 },
    documentsFailed: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

/**
 * Main Delivery Document Schema
 */
const DeliverySchema = new Schema<IDeliveryModel>(
  {
    deliveryReference: { type: String, required: true, unique: true },
    clientIdentifier: { type: String },
    uploadedAt: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: [
        "UPLOADED",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
      ] as DeliveryStatus[],
      required: true,
      default: "UPLOADED",
    },
    documents: { type: [DeliveryDocumentRefSchema], default: [] },
    deliveryValidation: { type: DeliveryValidationResultSchema },
    processingMetadata: { type: DeliveryProcessingMetadataSchema },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: "deliveries",
  }
);

/**
 * Indexes for Performance
 */
DeliverySchema.index({ clientIdentifier: 1 });
DeliverySchema.index({ status: 1 });
DeliverySchema.index({ uploadedAt: -1 });
DeliverySchema.index({ createdAt: -1 });
DeliverySchema.index({ "deliveryValidation.status": 1 });

/**
 * Delivery Model
 */
export const DeliveryModel = mongoose.model<IDeliveryModel>(
  "Delivery",
  DeliverySchema
);
