import mongoose, { Schema, Document } from "mongoose";
import {
  PODDocument as IPODDocument,
  PODStatus,
  ValidationStatus,
  PeculiarityType,
  SeverityLevel,
  DocumentType,
  StampType,
  SignatureType,
} from "../../../shared/types/pod-schema";

/**
 * POD Document Interface for Mongoose
 */
export interface IPODModel extends Omit<IPODDocument, "_id">, Document {}

/**
 * File Metadata Schema
 */
const FileMetadataSchema = new Schema(
  {
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, required: true, default: Date.now },
    storagePath: { type: String, required: true },
    checksum: { type: String, required: true },
  },
  { _id: false }
);

/**
 * Delivery Item Schema
 */
const DeliveryItemSchema = new Schema(
  {
    itemCode: { type: String },
    description: { type: String },
    expectedQuantity: { type: Number },
    deliveredQuantity: { type: Number },
  },
  { _id: false }
);

/**
 * Normalized POD Data Schema
 */
const NormalizedPODDataSchema = new Schema(
  {
    deliveryDate: { type: Date, default: null },
    recipientName: { type: String, default: null },
    recipientAddress: { type: String, default: null },
    driverName: { type: String, default: null },
    items: { type: [DeliveryItemSchema], default: [] },
    remarks: { type: String, default: null },
  },
  { _id: false }
);

/**
 * Extracted Data Schema
 */
const ExtractedDataSchema = new Schema(
  {
    rawText: { type: String },
    normalized: { type: NormalizedPODDataSchema, required: true },
  },
  { _id: false }
);

/**
 * Signature Check Schema
 */
const SignatureCheckSchema = new Schema(
  {
    expected: { type: Number, required: true, default: 2 },
    found: { type: Number, required: true, default: 0 },
    driverPresent: { type: Boolean, required: true, default: false },
    receiverPresent: { type: Boolean, required: true, default: false },
    confidence: { type: Number },
  },
  { _id: false }
);

/**
 * Image Quality Check Schema
 */
const ImageQualityCheckSchema = new Schema(
  {
    blurry: { type: Boolean, required: true, default: false },
    blurScore: { type: Number },
    incomplete: { type: Boolean, required: true, default: false },
    lowContrast: { type: Boolean, required: true, default: false },
  },
  { _id: false }
);

/**
 * Required Fields Check Schema
 */
const RequiredFieldsCheckSchema = new Schema(
  {
    missing: { type: [String], default: [] },
    present: { type: [String], default: [] },
  },
  { _id: false }
);

/**
 * Quantity Discrepancy Schema
 */
const QuantityDiscrepancySchema = new Schema(
  {
    itemCode: { type: String, required: true },
    expected: { type: Number, required: true },
    delivered: { type: Number, required: true },
    type: { type: String, enum: ["SHORTAGE", "OVERAGE"], required: true },
  },
  { _id: false }
);

/**
 * Items Validation Check Schema
 */
const ItemsValidationCheckSchema = new Schema(
  {
    matched: { type: Boolean, required: true, default: true },
    discrepancies: { type: [QuantityDiscrepancySchema], default: [] },
  },
  { _id: false }
);

/**
 * Template Match Check Schema
 */
const TemplateMatchCheckSchema = new Schema(
  {
    matched: { type: Boolean, required: true, default: false },
    confidence: { type: Number },
  },
  { _id: false }
);

/**
 * Validation Checks Schema
 */
const ValidationChecksSchema = new Schema(
  {
    signatures: { type: SignatureCheckSchema, required: true },
    imageQuality: { type: ImageQualityCheckSchema, required: true },
    requiredFields: { type: RequiredFieldsCheckSchema, required: true },
    itemsValidation: { type: ItemsValidationCheckSchema, required: true },
    templateMatch: { type: TemplateMatchCheckSchema },
  },
  { _id: false }
);

/**
 * Document Classification Schema
 */
const AlternativeTypeSchema = new Schema(
  {
    type: {
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
      required: true,
    },
    confidence: { type: Number, required: true },
  },
  { _id: false }
);

const DocumentClassificationSchema = new Schema(
  {
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
      required: true,
    },
    confidence: { type: Number, required: true },
    keywords: { type: [String], default: [] },
    alternativeTypes: { type: [AlternativeTypeSchema], default: [] },
    manualOverride: { type: Boolean, default: false },
    overrideReason: { type: String },
    overrideTimestamp: { type: Date },
    overrideBy: { type: String },
    inferredFromContext: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * Stamp Information Schema
 */
const StampInfoSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "DISPATCH",
        "NO_PALLET",
        "PALLET",
        "WAREHOUSE",
        "LOSCAM",
        "SECURITY",
        "OTHER",
      ] as StampType[],
      required: true,
    },
    text: { type: String, required: true },
    confidence: { type: Number, required: true },
    position: {
      x: { type: Number },
      y: { type: Number },
      width: { type: Number },
      height: { type: Number },
    },
  },
  { _id: false }
);

/**
 * Signature Information Schema
 */
const SignatureInfoSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        "DRIVER",
        "RECEIVER",
        "CUSTOMER",
        "SECURITY",
        "WAREHOUSE_STAFF",
        "CARRIER",
        "STORE_MANAGER",
      ] as SignatureType[],
      required: true,
    },
    present: { type: Boolean, required: true },
    confidence: { type: Number, required: true },
    position: {
      x: { type: Number },
      y: { type: Number },
      width: { type: Number },
      height: { type: Number },
    },
  },
  { _id: false }
);

/**
 * Stamp Detection Schema
 */
const StampDetectionSchema = new Schema(
  {
    stamps: { type: [StampInfoSchema], default: [] },
    signatures: { type: [SignatureInfoSchema], default: [] },
  },
  { _id: false }
);

/**
 * Peculiarity Schema
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
 * Validation Result Schema
 */
const ValidationResultSchema = new Schema(
  {
    status: {
      type: String,
      enum: ["PASS", "FAIL", "REVIEW"] as ValidationStatus[],
      required: true,
    },
    summary: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    checks: { type: ValidationChecksSchema, required: true },
    peculiarities: { type: [PeculiaritySchema], default: [] },
  },
  { _id: false }
);

/**
 * Processing Metadata Schema
 */
const ProcessingMetadataSchema = new Schema(
  {
    processedAt: { type: Date, required: true },
    processingTimeMs: { type: Number, required: true },
    ocrEngine: { type: String, required: true },
    ocrConfidence: { type: Number },
  },
  { _id: false }
);

/**
 * Main POD Document Schema
 */
const PODSchema = new Schema<IPODModel>(
  {
    fileMetadata: { type: FileMetadataSchema, required: true },
    clientIdentifier: { type: String },
    deliveryId: { type: Schema.Types.ObjectId, ref: "Delivery" }, // NEW: Reference to parent delivery
    extractedData: { type: ExtractedDataSchema, required: true },
    documentClassification: { type: DocumentClassificationSchema }, // NEW: Document type classification
    stampDetection: { type: StampDetectionSchema }, // NEW: Stamp and signature detection
    validationResult: { type: ValidationResultSchema, required: true },
    processingMetadata: { type: ProcessingMetadataSchema, required: true },
    status: {
      type: String,
      enum: ["UPLOADED", "PROCESSING", "COMPLETED", "FAILED"] as PODStatus[],
      required: true,
      default: "UPLOADED",
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: "pods",
  }
);

/**
 * Indexes for Performance
 */
PODSchema.index({ "fileMetadata.uploadedAt": -1 });
PODSchema.index({ "validationResult.status": 1 });
PODSchema.index({ clientIdentifier: 1 });
PODSchema.index({ status: 1 });
PODSchema.index({ createdAt: -1 });
PODSchema.index({ "fileMetadata.checksum": 1 });
PODSchema.index({ deliveryId: 1 }); // NEW: Index for delivery reference

/**
 * Pre-save middleware to sanitize confidence values
 */
PODSchema.pre("save", function (next) {
  if (this.validationResult?.checks?.signatures?.confidence !== undefined) {
    if (isNaN(this.validationResult.checks.signatures.confidence)) {
      this.validationResult.checks.signatures.confidence = 0;
    }
  }
  next();
});

/**
 * POD Model
 */
export const PODModel = mongoose.model<IPODModel>("POD", PODSchema);
