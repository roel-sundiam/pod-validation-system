import { PODModel } from '../models/pod.model';
import { DocumentType, DocumentClassification } from '../../../shared/types/pod-schema';
import { createModuleLogger } from '../middleware/logger';
import Fuse from 'fuse.js';

const logger = createModuleLogger('DocumentClassificationService');

/**
 * Keyword Configuration for Document Classification
 * Each document type has primary (high weight) and secondary (low weight) keywords
 */
interface KeywordConfig {
  primary: string[];
  secondary: string[];
  weight: {
    primary: number;
    secondary: number;
  };
}

const DOCUMENT_KEYWORDS: Record<string, KeywordConfig> = {
  PALLET_NOTIFICATION_LETTER: {
    primary: ['pallet notification', 'notification letter', 'pallet notification letter'],
    secondary: ['warehouse stamp', 'warehouse signature', 'pallet', 'notification'],
    weight: { primary: 10, secondary: 2 }
  },
  LOSCAM_DOCUMENT: {
    primary: ['loscam', 'loscam document', 'loscam philippines', 'customer transaction'],
    secondary: ['pallet exchange', 'pallet rental', 'customer signature', 'exchange', 'docket no', 'transaction date', 'qty sent'],
    weight: { primary: 10, secondary: 2 }
  },
  CUSTOMER_PALLET_RECEIVING: {
    primary: [
      'customer pallet receiving', 'pallet receiving', 'receiving document',
      'plate number', 'platc number',  // Handle OCR errors for "Plate Number"
      'received qty', 'received quantity'  // Strong indicators promoted to primary
    ],
    secondary: [
      'received', 'pallet receipt', 'customer receipt',
      'returned qty', 'returned quantity',
      'trucker',  // Common on pallet receiving documents
      'loscam', 'rppc',  // Pallet types on receiving docs
      'invoice number'  // Receiving docs often reference invoice numbers
    ],
    weight: { primary: 10, secondary: 2 }
  },
  SHIP_DOCUMENT: {
    primary: [
      'ship document', 'shipping document', 'dispatch', 'shipment document',
      'shipment'  // Common header on ship docs
    ],
    secondary: [
      'dispatch stamp', 'time-out', 'time out', 'security', 'carrier',
      'warehouse address', 'gate', 'driver', 'customer name',
      'delivered', 'dispatch date', 'shipper', 'consignee',
      'date and time', 'release', 'guard on duty',
      'unilever philippines',  // Specific to Unilever shipping docs
      'stamp', 'approved', 'signature',  // Generic but common on ship docs
      'address', 'remarks'  // Very common fields
    ],
    weight: { primary: 10, secondary: 5 }  // Even higher weight to ensure detection
  },
  INVOICE: {
    primary: ['invoice', 'invoice no', 'invoice number', 'inv no'],
    secondary: ['PO number', 'purchase order', 'bill to', 'invoice date', 'total amount'],
    weight: { primary: 10, secondary: 2 }
  },
  RAR: {
    primary: [
      'receiving acknowledgement receipt',  // Full phrase (British)
      'receiving acknowledgment receipt',  // Full phrase (US)
      'CFAST receiving acknowledgement',  // Specific format
      'RAR', 'R.A.R', 'R.A.R.', 'R & A R', 'R&AR',
      'receiving and acknowledgment',
      'receiving & acknowledgment',
      'receiving and acknowledgement',
      'receiving acknowledgment',
      'receiving acknowledgement',
      'acknowledgment receipt',
      'acknowledgement receipt',
      'R & A receipt',
      'receiving report',
      'goods received note',
      'delivery receipt'
    ],
    secondary: [
      'received', 'acknowledged', 'total cases',
      'receiving report', 'goods received',
      'qty received', 'quantity received',
      'receiver signature', 'received by',
      'delivery confirmation', 'confirmed delivery',
      'acceptance', 'accepted by'
    ],
    weight: { primary: 10, secondary: 3 }
  }
};

// Minimum confidence threshold for classification
const MINIMUM_CONFIDENCE_THRESHOLD = 25;

/**
 * Calculate confidence score for a document type based on keyword matches
 * Includes fuzzy matching to handle OCR errors
 */
function calculateConfidence(text: string, config: KeywordConfig): { score: number, keywords: string[] } {
  const lowerText = text.toLowerCase();
  const matchedKeywords: string[] = [];
  let score = 0;

  // Split text into words for fuzzy matching
  const words = lowerText.split(/\s+/);
  const fuse = new Fuse(words, {
    threshold: 0.3,  // 30% difference allowed
    includeScore: true
  });

  // Check primary keywords - exact match first
  for (const keyword of config.primary) {
    const lowerKeyword = keyword.toLowerCase();

    // Exact match
    if (lowerText.includes(lowerKeyword)) {
      score += config.weight.primary;
      matchedKeywords.push(keyword);
    } else {
      // Fuzzy match for OCR errors
      const results = fuse.search(lowerKeyword);
      if (results.length > 0 && results[0].score! < 0.3) {
        score += config.weight.primary * 0.7; // 70% weight for fuzzy match
        matchedKeywords.push(`${keyword} (fuzzy: ${results[0].item})`);
      }
    }
  }

  // Check secondary keywords - exact match first
  for (const keyword of config.secondary) {
    const lowerKeyword = keyword.toLowerCase();

    // Exact match
    if (lowerText.includes(lowerKeyword)) {
      score += config.weight.secondary;
      matchedKeywords.push(keyword);
    } else {
      // Fuzzy match for OCR errors
      const results = fuse.search(lowerKeyword);
      if (results.length > 0 && results[0].score! < 0.3) {
        score += config.weight.secondary * 0.7; // 70% weight for fuzzy match
        matchedKeywords.push(`${keyword} (fuzzy: ${results[0].item})`);
      }
    }
  }

  return { score, keywords: matchedKeywords };
}

/**
 * Classify a document based on OCR text
 */
export const classifyDocument = async (podId: string, rawText?: string): Promise<DocumentClassification> => {
  logger.info('Classifying document', { podId });

  // Load POD to check for manual override
  const pod = await PODModel.findById(podId);
  if (!pod) {
    throw new Error(`POD not found: ${podId}`);
  }

  // If document has a manual override, skip reclassification and return existing classification
  if (pod.documentClassification?.manualOverride) {
    logger.info('Document has manual override, skipping reclassification', {
      podId,
      detectedType: pod.documentClassification.detectedType,
      overrideReason: pod.documentClassification.overrideReason
    });
    return pod.documentClassification;
  }

  // If rawText not provided, use text from database
  let textToClassify = rawText || pod.extractedData.rawText || '';

  if (!textToClassify || textToClassify.trim().length === 0) {
    logger.warn('No OCR text available for classification', { podId });
    return {
      detectedType: 'UNKNOWN',
      confidence: 0,
      keywords: [],
      alternativeTypes: []
    };
  }

  // Calculate scores for each document type
  const scores: { type: DocumentType, score: number, keywords: string[] }[] = [];

  for (const [typeName, config] of Object.entries(DOCUMENT_KEYWORDS)) {
    const { score, keywords } = calculateConfidence(textToClassify, config);
    scores.push({
      type: typeName as DocumentType,
      score,
      keywords
    });
  }

  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);

  // Prioritize RAR if both Invoice and RAR have similar scores
  // This handles combined Invoice+RAR documents
  const topMatch = scores[0];
  const rarMatch = scores.find(s => s.type === 'RAR');
  const invoiceMatch = scores.find(s => s.type === 'INVOICE');

  let finalTopMatch = topMatch;

  if (rarMatch && invoiceMatch && rarMatch.score > 0 && invoiceMatch.score > 0) {
    // If RAR score is at least 50% of invoice score, prioritize RAR
    // This is because RAR is more specific and required for validation
    if (rarMatch.score >= invoiceMatch.score * 0.5) {
      finalTopMatch = rarMatch;
      logger.info('Prioritizing RAR over INVOICE for combined document', {
        podId,
        rarScore: rarMatch.score,
        invoiceScore: invoiceMatch.score
      });
    }
  }

  const topMatchToUse = finalTopMatch;

  // Calculate confidence as a percentage (normalize to 0-100)
  // Max possible score is primary keywords * weight (roughly 50-60 points)
  const maxPossibleScore = 60; // Approximate max
  const confidencePercent = Math.min(100, (topMatchToUse.score / maxPossibleScore) * 100);

  // Dynamic threshold based on OCR quality
  const ocrConfidence = pod.processingMetadata?.ocrConfidence || 100;
  let adjustedThreshold = MINIMUM_CONFIDENCE_THRESHOLD;

  if (ocrConfidence < 60) {
    adjustedThreshold = 15; // Lower threshold for poor OCR quality
    logger.info('Using lower classification threshold due to poor OCR quality', {
      podId,
      ocrConfidence,
      threshold: adjustedThreshold
    });
  } else if (ocrConfidence < 75) {
    adjustedThreshold = 20; // Slightly lower for medium OCR quality
    logger.info('Using medium classification threshold', {
      podId,
      ocrConfidence,
      threshold: adjustedThreshold
    });
  }

  // Determine if confidence is high enough
  const detectedType: DocumentType = confidencePercent >= adjustedThreshold
    ? topMatch.type
    : 'UNKNOWN';

  // Get alternative types (top 3 excluding the top match)
  const alternativeTypes = scores
    .slice(1, 4)
    .filter(s => s.score > 0)
    .map(s => ({
      type: s.type,
      confidence: Math.min(100, (s.score / maxPossibleScore) * 100)
    }));

  const classification: DocumentClassification = {
    detectedType,
    confidence: confidencePercent,
    keywords: topMatchToUse.keywords,
    alternativeTypes
  };

  logger.info('Document classification complete', {
    podId,
    detectedType,
    confidence: confidencePercent.toFixed(2),
    keywordsFound: topMatch.keywords.length
  });

  return classification;
};

/**
 * Classify document based on provided text (for testing or direct use)
 */
export const classifyDocumentText = (text: string): DocumentClassification => {
  if (!text || text.trim().length === 0) {
    return {
      detectedType: 'UNKNOWN',
      confidence: 0,
      keywords: [],
      alternativeTypes: []
    };
  }

  // Calculate scores for each document type
  const scores: { type: DocumentType, score: number, keywords: string[] }[] = [];

  for (const [typeName, config] of Object.entries(DOCUMENT_KEYWORDS)) {
    const { score, keywords } = calculateConfidence(text, config);
    scores.push({
      type: typeName as DocumentType,
      score,
      keywords
    });
  }

  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);

  const topMatch = scores[0];
  const maxPossibleScore = 60;
  const confidencePercent = Math.min(100, (topMatch.score / maxPossibleScore) * 100);

  const detectedType: DocumentType = confidencePercent >= MINIMUM_CONFIDENCE_THRESHOLD
    ? topMatch.type
    : 'UNKNOWN';

  const alternativeTypes = scores
    .slice(1, 4)
    .filter(s => s.score > 0)
    .map(s => ({
      type: s.type,
      confidence: Math.min(100, (s.score / maxPossibleScore) * 100)
    }));

  return {
    detectedType,
    confidence: confidencePercent,
    keywords: topMatch.keywords,
    alternativeTypes
  };
};

/**
 * Update POD document with classification result
 */
export const classifyAndUpdatePOD = async (podId: string): Promise<void> => {
  const classification = await classifyDocument(podId);

  await PODModel.findByIdAndUpdate(podId, {
    documentClassification: classification
  });

  logger.info('POD updated with classification', { podId, detectedType: classification.detectedType });
};
