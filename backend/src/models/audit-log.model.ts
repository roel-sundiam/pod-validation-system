import mongoose, { Schema, Document } from 'mongoose';

/**
 * Audit Log Action Types
 */
export type AuditAction =
  | 'UPLOAD'
  | 'PROCESS'
  | 'VALIDATE'
  | 'REVIEW'
  | 'APPROVE'
  | 'REJECT'
  | 'REPROCESS';

/**
 * Audit Log Interface
 */
export interface IAuditLog {
  podId: mongoose.Types.ObjectId | string;
  action: AuditAction;
  performedBy?: string;
  timestamp: Date;
  details: Record<string, any>;
  systemInfo?: {
    ipAddress?: string;
    userAgent?: string;
  };
}

/**
 * Audit Log Document Interface for Mongoose
 */
export interface IAuditLogModel extends IAuditLog, Document {}

/**
 * System Info Schema
 */
const SystemInfoSchema = new Schema({
  ipAddress: { type: String },
  userAgent: { type: String },
}, { _id: false });

/**
 * Audit Log Schema
 */
const AuditLogSchema = new Schema<IAuditLogModel>(
  {
    podId: {
      type: Schema.Types.ObjectId,
      ref: 'POD',
      required: true
    },
    action: {
      type: String,
      enum: [
        'UPLOAD',
        'PROCESS',
        'VALIDATE',
        'REVIEW',
        'APPROVE',
        'REJECT',
        'REPROCESS',
      ] as AuditAction[],
      required: true,
    },
    performedBy: { type: String }, // User identifier (for future authentication)
    timestamp: { type: Date, required: true, default: Date.now },
    details: { type: Schema.Types.Mixed, default: {} },
    systemInfo: { type: SystemInfoSchema },
  },
  {
    collection: 'audit_logs',
  }
);

/**
 * Indexes for Performance
 */
AuditLogSchema.index({ podId: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ action: 1 });

/**
 * Audit Log Model
 */
export const AuditLogModel = mongoose.model<IAuditLogModel>('AuditLog', AuditLogSchema);

/**
 * Helper function to create audit log entry
 */
export const createAuditLog = async (
  podId: string | mongoose.Types.ObjectId,
  action: AuditAction,
  details: Record<string, any> = {},
  systemInfo?: { ipAddress?: string; userAgent?: string }
): Promise<IAuditLogModel> => {
  const auditLog = new AuditLogModel({
    podId,
    action,
    details,
    systemInfo,
    timestamp: new Date(),
  });

  return await auditLog.save();
};
