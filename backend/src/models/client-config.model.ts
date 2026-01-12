import mongoose, { Schema, Document } from "mongoose";
import { ClientValidationConfig } from "../../../shared/types/client-config.schema";

export interface IClientConfigModel
  extends Omit<ClientValidationConfig, "_id">,
    Document {}

const DocumentCompletenessRulesSchema = new Schema(
  {
    requirePalletNotificationLetter: { type: Boolean, default: false },
    requireLoscamDocument: { type: Boolean, default: false },
    requireCustomerPalletReceiving: { type: Boolean, default: false },
    requireShipDocument: { type: Boolean, default: true },
    requireInvoice: { type: Boolean, default: true },
    requireRAR: { type: Boolean, default: true },
    palletScenario: {
      type: String,
      enum: ["WITH_PALLETS", "WITHOUT_PALLETS", "AUTO_DETECT"],
      default: "AUTO_DETECT",
    },
  },
  { _id: false }
);

const PalletValidationRulesSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    requireWarehouseStamp: { type: Boolean, default: false },
    requireWarehouseSignature: { type: Boolean, default: false },
    requireCustomerSignature: { type: Boolean, default: false },
    requireDriverSignature: { type: Boolean, default: false },
    requireLoscamStamp: { type: Boolean, default: false },
  },
  { _id: false }
);

const ShipDocumentValidationRulesSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    requireDispatchStamp: { type: Boolean, default: true },
    requirePalletStamp: { type: Boolean, default: false },
    requireNoPalletStamp: { type: Boolean, default: false },
    requireSecuritySignature: { type: Boolean, default: true },
    requireTimeOutField: { type: Boolean, default: false },
    requireDriverSignature: { type: Boolean, default: false },
  },
  { _id: false }
);

const InvoiceValidationRulesSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    requirePOMatch: { type: Boolean, default: true },
    requireTotalCasesMatch: { type: Boolean, default: true },
    allowedVariancePercent: { type: Number, default: 0, min: 0, max: 100 },
    requireItemLevelMatch: { type: Boolean, default: false },
    compareFields: [{ type: String }],
  },
  { _id: false }
);

const CrossDocumentValidationRulesSchema = new Schema(
  {
    enabled: { type: Boolean, default: true },
    validateInvoiceRAR: { type: Boolean, default: true },
    allowedDiscrepancyCount: { type: Number, default: 0, min: 0 },
    strictMode: { type: Boolean, default: true },
  },
  { _id: false }
);

const ValidationRuleSetSchema = new Schema(
  {
    documentCompleteness: {
      type: DocumentCompletenessRulesSchema,
      required: true,
    },
    palletValidation: { type: PalletValidationRulesSchema, required: true },
    shipDocumentValidation: {
      type: ShipDocumentValidationRulesSchema,
      required: true,
    },
    invoiceValidation: { type: InvoiceValidationRulesSchema, required: true },
    crossDocumentValidation: {
      type: CrossDocumentValidationRulesSchema,
      required: true,
    },
  },
  { _id: false }
);

const ClientValidationConfigSchema = new Schema<IClientConfigModel>(
  {
    clientId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    validationRules: {
      type: ValidationRuleSetSchema,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: "client_validation_configs",
  }
);

// Indexes for efficient queries
ClientValidationConfigSchema.index({ clientId: 1, isActive: 1 });

// Instance methods
ClientValidationConfigSchema.methods.toJSON = function () {
  const obj = this.toObject();
  return obj;
};

// Add static method types
interface IClientConfigModelStatic extends mongoose.Model<IClientConfigModel> {
  findByClientId(clientId: string): Promise<IClientConfigModel | null>;
  getActiveClients(): Promise<
    Pick<IClientConfigModel, "clientId" | "clientName" | "description">[]
  >;
}

// Static methods
ClientValidationConfigSchema.statics.findByClientId = function (
  clientId: string
) {
  return this.findOne({ clientId: clientId.toUpperCase(), isActive: true });
};

ClientValidationConfigSchema.statics.getActiveClients = function () {
  return this.find({ isActive: true }).select(
    "clientId clientName description"
  );
};

export const ClientConfigModel = mongoose.model<
  IClientConfigModel,
  IClientConfigModelStatic
>("ClientValidationConfig", ClientValidationConfigSchema);
