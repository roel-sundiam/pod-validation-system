import { PODModel } from '../models/pod.model';
import { StampDetection, StampInfo, SignatureInfo, StampType, SignatureType, DocumentType, SignatureDetectionResult } from '../../../shared/types/pod-schema';
import { createModuleLogger } from '../middleware/logger';

const logger = createModuleLogger('StampDetectionService');

/**
 * Stamp Pattern Configuration
 * Regex patterns to detect stamps in OCR text
 */
const STAMP_PATTERNS: Record<StampType, RegExp> = {
  DISPATCH: /dispatch(?:ed)?(?:\s*stamp)?|shipment\s*document/i,  // "Shipment Document" = dispatch
  NO_PALLET: /no\s*pallet/i,
  PALLET: /pallet(?:\s*stamp)?|pallet\s*notification/i,
  WAREHOUSE: /warehouse(?:\s*stamp)?/i,
  LOSCAM: /loscam/i,
  SECURITY: /security(?:\s*stamp)?/i,
  OTHER: /stamp/i // Generic stamp pattern
};

/**
 * Signature Pattern Configuration
 * Patterns to detect signature mentions in text
 */
const SIGNATURE_PATTERNS: Record<SignatureType, RegExp[]> = {
  DRIVER: [
    /driver\s*signature/i,
    /driver\s*sign/i,
    /signed\s*by\s*driver/i,
    /sent\s*by/i,  // Added for Loscam documents
    /service\s*provider/i,  // Ship documents use "Service Provider" for driver/carrier
    /prepared\s*by/i  // Sometimes the preparer is the driver
  ],
  RECEIVER: [
    /receiver\s*signature/i,
    /receiver\s*sign/i,
    /received\s*by/i,
    /recipient\s*signature/i
  ],
  CUSTOMER: [
    /customer\s*signature/i,
    /customer\s*sign/i,
    /signed\s*by\s*customer/i,
    /received\s*by/i  // Added: "Received By" on Loscam = customer signature
  ],
  SECURITY: [
    /security\s*signature/i,
    /security\s*sign/i,
    /signed\s*by\s*security/i,
    /guard\s*on\s*duty/i,  // Ship documents use "Guard on Duty" for security
    /guard\s*signature/i
  ],
  WAREHOUSE_STAFF: [
    /warehouse\s*staff\s*signature/i,
    /warehouse\s*signature/i,
    /warehouse\s*sign/i,
    /customer'?s?\s*signature/i,  // Pallet Notification Letters use "Customer's Signature"
    /authorized\s*personnel/i  // Alternative wording
  ],
  CARRIER: [
    /carrier\s*signature/i,
    /carrier\s*sign/i,
    /signed\s*by\s*carrier/i
  ],
  STORE_MANAGER: [
    /store\s*manager\s*signature/i,
    /manager\s*signature/i,
    /store\s*manager\s*sign/i
  ]
};

/**
 * Document-specific signature type mapping rules
 * Maps image positions to correct signature types based on document context
 */
const DOCUMENT_SIGNATURE_MAPPING: Record<DocumentType, {
  leftSide: SignatureType[];
  rightSide: SignatureType[];
  priority: SignatureType;
}> = {
  LOSCAM_DOCUMENT: {
    leftSide: ['DRIVER'],
    rightSide: ['CUSTOMER', 'RECEIVER'],  // Loscam: customer signs on right
    priority: 'CUSTOMER'
  },
  SHIP_DOCUMENT: {
    leftSide: ['DRIVER', 'CARRIER'],
    rightSide: ['SECURITY', 'WAREHOUSE_STAFF'],
    priority: 'DRIVER'
  },
  PALLET_NOTIFICATION_LETTER: {
    leftSide: ['DRIVER', 'CARRIER'],
    rightSide: ['WAREHOUSE_STAFF'],
    priority: 'WAREHOUSE_STAFF'
  },
  CUSTOMER_PALLET_RECEIVING: {
    leftSide: ['DRIVER'],
    rightSide: ['RECEIVER', 'CUSTOMER'],
    priority: 'RECEIVER'
  },
  INVOICE: {
    leftSide: [],
    rightSide: [],
    priority: 'RECEIVER'
  },
  RAR: {
    leftSide: [],
    rightSide: ['RECEIVER', 'STORE_MANAGER'],
    priority: 'RECEIVER'
  },
  UNKNOWN: {
    leftSide: ['DRIVER'],
    rightSide: ['RECEIVER'],
    priority: 'RECEIVER'
  }
};

/**
 * Detect stamps in OCR text with document type awareness
 */
function detectStampsInText(text: string, documentType?: DocumentType): StampInfo[] {
  const stamps: StampInfo[] = [];
  const lowerText = text.toLowerCase();

  for (const [stampType, pattern] of Object.entries(STAMP_PATTERNS)) {
    const matches = text.match(new RegExp(pattern, 'gi'));

    if (matches) {
      for (const match of matches) {
        // Calculate confidence based on match quality
        const confidence = match.toLowerCase() === match.toLowerCase().trim() ? 90 : 75;

        stamps.push({
          type: stampType as StampType,
          text: match,
          confidence,
          // Note: Position would come from Tesseract bounding boxes if available
          // For now, we'll leave it undefined since we're analyzing full text
        });
      }
    }
  }

  // Remove duplicates (keep highest confidence)
  const uniqueStamps = new Map<StampType, StampInfo>();
  for (const stamp of stamps) {
    const existing = uniqueStamps.get(stamp.type);
    if (!existing || stamp.confidence > existing.confidence) {
      uniqueStamps.set(stamp.type, stamp);
    }
  }

  // Special handling for Ship Documents: Infer pallet stamp if dispatch stamp present
  // Ship documents serving as dispatch records often don't have separate "PALLET STAMP" text
  // but the presence of dispatch stamp + warehouse references implies pallet handling
  if (documentType === 'SHIP_DOCUMENT') {
    const hasDispatch = uniqueStamps.has('DISPATCH');
    const hasWarehouse = uniqueStamps.has('WAREHOUSE') || /warehouse/i.test(text);

    if (hasDispatch && hasWarehouse && !uniqueStamps.has('PALLET')) {
      uniqueStamps.set('PALLET', {
        type: 'PALLET',
        text: 'INFERRED',
        confidence: 70
      });
    }
  }

  // Special handling for Pallet Notification Letters: Infer warehouse stamp
  // These letters are warehouse notifications, so they inherently represent warehouse involvement
  // even without explicit "WAREHOUSE STAMP" text
  if (documentType === 'PALLET_NOTIFICATION_LETTER') {
    const hasPalletNotification = /pallet\s*notification/i.test(text);
    const hasWarehouseReference = /warehouse|wh\s|warenouse/i.test(text);

    if (hasPalletNotification && hasWarehouseReference && !uniqueStamps.has('WAREHOUSE')) {
      uniqueStamps.set('WAREHOUSE', {
        type: 'WAREHOUSE',
        text: 'INFERRED',
        confidence: 75
      });
    }
  }

  return Array.from(uniqueStamps.values());
}

/**
 * Detect signatures in OCR text with document type awareness
 */
function detectSignaturesInText(text: string, documentType?: DocumentType): SignatureInfo[] {
  const signatures: SignatureInfo[] = [];

  // Special handling for Loscam documents
  if (documentType === 'LOSCAM_DOCUMENT') {
    // Loscam documents have multiple signature label formats:
    // Format 1: "Sent By" / "Received By" (handwritten section labels)
    // Format 2: "Sender AC Name" / "Receiver AC Name" (printed form fields)
    // Both indicate signature locations

    const hasSentBy = /sent\s*by/i.test(text);
    const hasSender = /sender\s*(ac\s*name)?/i.test(text);
    const hasReceivedBy = /receiver?\s*b[ye]/i.test(text) || /received\s*by/i.test(text);
    const hasReceiver = /re[cz]eiver\s*(ac\s*name)?/i.test(text); // Handle OCR: "Rezeiver"

    logger.info('Loscam signature detection', {
      textLength: text.length,
      hasSentBy,
      hasSender,
      hasReceivedBy,
      hasReceiver,
      textPreview: text.substring(0, 500)
    });

    // For Loscam: "Sent By" or "Sender" = DRIVER signature
    if (/sent\s*by/i.test(text) || /sender\s*(ac\s*name)?/i.test(text)) {
      signatures.push({
        type: 'DRIVER',
        present: true,
        confidence: 85
      });
    }

    // For Loscam: "Received By" or "Receiver" = CUSTOMER signature
    if (/receiver?\s*b[ye]/i.test(text) || /received\s*by/i.test(text) || /re[cz]eiver\s*(ac\s*name)?/i.test(text)) {
      signatures.push({
        type: 'CUSTOMER',
        present: true,
        confidence: 85
      });
    }
    return signatures;
  }

  // Generic detection for other document types
  for (const [sigType, patterns] of Object.entries(SIGNATURE_PATTERNS)) {
    let found = false;
    let matchedText = '';

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        found = true;
        matchedText = match[0];
        break;
      }
    }

    if (found) {
      signatures.push({
        type: sigType as SignatureType,
        present: true,
        confidence: 85,
        // Position would come from Tesseract bounding boxes if available
      });
    }
  }

  return signatures;
}

/**
 * Map image-based signature detection to typed SignatureInfo array
 * Uses document type context to determine correct signature types
 */
function mapImageSignaturesToSignatureInfo(
  imageResult: SignatureDetectionResult,
  documentType?: DocumentType
): SignatureInfo[] {
  const signatures: SignatureInfo[] = [];
  const mapping = DOCUMENT_SIGNATURE_MAPPING[documentType || 'UNKNOWN'];

  // Ensure confidence is a valid number
  const confidence = typeof imageResult.confidence === 'number' && !isNaN(imageResult.confidence)
    ? imageResult.confidence
    : 70;

  // Map driver (left side)
  if (imageResult.driverPresent && mapping.leftSide.length > 0) {
    const leftRegions = imageResult.regions?.filter((r: any) => !r.isRightSide);
    const signatureType = mapping.leftSide[0]; // Use primary left type

    signatures.push({
      type: signatureType,
      present: true,
      confidence,
      position: leftRegions && leftRegions.length > 0 ? leftRegions[0] : undefined
    });
  }

  // Map receiver/customer (right side)
  if (imageResult.receiverPresent && mapping.rightSide.length > 0) {
    const rightRegions = imageResult.regions?.filter((r: any) => r.isRightSide);
    const signatureType = mapping.priority; // Use priority type for right side

    signatures.push({
      type: signatureType,
      present: true,
      confidence,
      position: rightRegions && rightRegions.length > 0 ? rightRegions[0] : undefined
    });
  }

  return signatures;
}

/**
 * Merge text-based and image-based signature detections
 * Strategy:
 * - Text + Image (same type): Merge with averaged confidence
 * - Text only: Keep text detection
 * - Image only: Add image detection (fills gaps)
 */
function mergeSignatureDetections(
  textSignatures: SignatureInfo[],
  imageSignatures: SignatureInfo[]
): SignatureInfo[] {
  const merged = new Map<SignatureType, SignatureInfo>();

  // Add text-based detections first
  textSignatures.forEach(sig => {
    merged.set(sig.type, { ...sig });
  });

  // Merge or add image-based detections
  imageSignatures.forEach(imageSig => {
    const existing = merged.get(imageSig.type);

    if (existing) {
      // Both methods detected - merge with weighted confidence
      // 60% text-based (more reliable type detection), 40% image-based (proves physical signature exists)
      const existingConf = typeof existing.confidence === 'number' && !isNaN(existing.confidence) ? existing.confidence : 85;
      const imageConf = typeof imageSig.confidence === 'number' && !isNaN(imageSig.confidence) ? imageSig.confidence : 70;
      const mergedConfidence = Math.round((existingConf * 0.6) + (imageConf * 0.4));

      merged.set(imageSig.type, {
        type: imageSig.type,
        present: true,
        confidence: isNaN(mergedConfidence) ? 80 : mergedConfidence,
        position: existing.position || imageSig.position
      });
    } else {
      // Only image detected - add it (this fills the gap!)
      // Ensure confidence is valid
      merged.set(imageSig.type, {
        ...imageSig,
        confidence: typeof imageSig.confidence === 'number' && !isNaN(imageSig.confidence) ? imageSig.confidence : 70
      });
    }
  });

  return Array.from(merged.values());
}

/**
 * Detect stamps and signatures in a POD document
 *
 * @param podId - The POD document ID
 * @param rawText - Optional OCR text (if not provided, will load from database)
 * @param imageSignatureResult - Optional image-based signature detection result
 * @param documentType - Optional document type for context-aware signature mapping
 */
export const detectStamps = async (
  podId: string,
  rawText?: string,
  imageSignatureResult?: SignatureDetectionResult,
  documentType?: DocumentType
): Promise<StampDetection> => {
  logger.info('Detecting stamps and signatures', { podId, documentType });

  // If rawText not provided, load from database
  let textToAnalyze = rawText;
  if (!textToAnalyze) {
    const pod = await PODModel.findById(podId);
    if (!pod) {
      throw new Error(`POD not found: ${podId}`);
    }
    textToAnalyze = pod.extractedData.rawText || '';
  }

  if (!textToAnalyze || textToAnalyze.trim().length === 0) {
    logger.warn('No OCR text available for stamp detection', { podId });
    return {
      stamps: [],
      signatures: []
    };
  }

  // Text-based detection
  const stamps = detectStampsInText(textToAnalyze, documentType);
  const textSignatures = detectSignaturesInText(textToAnalyze, documentType);

  // Image-based detection integration
  let finalSignatures = textSignatures;
  if (imageSignatureResult && imageSignatureResult.found > 0) {
    const imageSignatures = mapImageSignaturesToSignatureInfo(
      imageSignatureResult,
      documentType
    );

    finalSignatures = mergeSignatureDetections(textSignatures, imageSignatures);

    logger.info('Merged signature detections', {
      podId,
      documentType,
      textOnly: textSignatures.map(s => s.type),
      imageOnly: imageSignatures.map(s => s.type),
      merged: finalSignatures.map(s => ({ type: s.type, confidence: s.confidence }))
    });
  }

  const stampDetection: StampDetection = {
    stamps,
    signatures: finalSignatures
  };

  logger.info('Stamp detection complete', {
    podId,
    stampsFound: stamps.length,
    signaturesFound: finalSignatures.length,
    stampTypes: stamps.map(s => s.type),
    signatureTypes: finalSignatures.map(s => s.type),
    imageBasedUsed: imageSignatureResult && imageSignatureResult.found > 0
  });

  return stampDetection;
};

/**
 * Detect stamps in provided text (for testing or direct use)
 */
export const detectStampsInOCRText = (text: string): StampDetection => {
  if (!text || text.trim().length === 0) {
    return {
      stamps: [],
      signatures: []
    };
  }

  const stamps = detectStampsInText(text);
  const signatures = detectSignaturesInText(text);

  return {
    stamps,
    signatures
  };
};

/**
 * Update POD document with stamp detection result
 */
export const detectAndUpdateStamps = async (podId: string): Promise<void> => {
  const stampDetection = await detectStamps(podId);

  await PODModel.findByIdAndUpdate(podId, {
    stampDetection
  });

  logger.info('POD updated with stamp detection', {
    podId,
    stampsFound: stampDetection.stamps.length,
    signaturesFound: stampDetection.signatures.length
  });
};

/**
 * Check if a specific stamp type is present in stamp detection result
 */
export const hasStamp = (stampDetection: StampDetection, stampType: StampType): boolean => {
  return stampDetection.stamps.some(stamp => stamp.type === stampType);
};

/**
 * Check if a specific signature type is present in stamp detection result
 */
export const hasSignature = (stampDetection: StampDetection, signatureType: SignatureType): boolean => {
  return stampDetection.signatures.some(sig => sig.type === signatureType && sig.present);
};

/**
 * Get all stamps of a specific type
 */
export const getStampsByType = (stampDetection: StampDetection, stampType: StampType): StampInfo[] => {
  return stampDetection.stamps.filter(stamp => stamp.type === stampType);
};

/**
 * Get all signatures of a specific type
 */
export const getSignaturesByType = (stampDetection: StampDetection, signatureType: SignatureType): SignatureInfo[] => {
  return stampDetection.signatures.filter(sig => sig.type === signatureType);
};
