/**
 * Super 8 Validation Rules Configuration
 *
 * Centralizes all Super 8-specific validation rules and requirements.
 * This configuration-driven approach makes it easy to update rules
 * without modifying code.
 */

import { DocumentType, StampType, SignatureType } from '../../../shared/types/pod-schema';

/**
 * Super 8 Validation Rules
 */
export const Super8ValidationRules = {
  /**
   * Document type keywords for classification
   * (Used by document-classification.service.ts)
   */
  documentKeywords: {
    PALLET_NOTIFICATION_LETTER: {
      primary: ['pallet notification', 'notification letter', 'pallet notification letter'],
      secondary: ['warehouse stamp', 'warehouse signature', 'pallet', 'notification'],
      weight: { primary: 10, secondary: 2 }
    },
    LOSCAM_DOCUMENT: {
      primary: ['loscam', 'loscam document'],
      secondary: ['pallet exchange', 'pallet rental', 'customer signature'],
      weight: { primary: 10, secondary: 2 }
    },
    CUSTOMER_PALLET_RECEIVING: {
      primary: ['customer pallet receiving', 'pallet receiving', 'receiving document'],
      secondary: ['received', 'pallet receipt', 'customer receipt'],
      weight: { primary: 10, secondary: 2 }
    },
    SHIP_DOCUMENT: {
      primary: ['ship document', 'shipping document', 'dispatch', 'shipment'],
      secondary: ['dispatch stamp', 'time-out', 'time out', 'security', 'carrier'],
      weight: { primary: 10, secondary: 2 }
    },
    INVOICE: {
      primary: ['invoice', 'invoice no', 'invoice number', 'inv no'],
      secondary: ['PO number', 'purchase order', 'bill to', 'invoice date', 'total amount'],
      weight: { primary: 10, secondary: 2 }
    },
    RAR: {
      primary: [
        'RAR', 'R.A.R', 'R.A.R.', 'R & A R', 'R&AR', 'R A R',
        'receiving acknowledgement receipt',  // Full phrase (British)
        'receiving acknowledgment receipt',  // Full phrase (US)
        'receiving and acknowledgment',
        'receiving & acknowledgment',
        'receiving and acknowledgement',  // British spelling
        'receiving acknowledgment',  // Without "and"
        'receiving acknowledgement',  // Without "and", British
        'acknowledgment receipt',
        'acknowledgement receipt',  // British spelling
        'R & A receipt',
        'receiving report',
        'goods received note',
        'delivery receipt',
        'CFAST receiving acknowledgement'  // Specific format
      ],
      secondary: [
        'received', 'acknowledged', 'total cases',
        'receiving report', 'goods received',
        'qty received', 'quantity received',
        'receiver signature', 'received by',
        'delivery confirmation', 'confirmed delivery',
        'acceptance', 'accepted by'
      ],
      weight: { primary: 10, secondary: 3 }  // Increased secondary weight
    }
  },

  /**
   * Stamp patterns for detection
   * (Used by stamp-detection.service.ts)
   */
  stampPatterns: {
    DISPATCH: /dispatch(?:ed)?(?:\s*stamp)?/i,
    NO_PALLET: /no\s*pallet/i,
    PALLET: /pallet(?:\s*stamp)?/i,
    WAREHOUSE: /warehouse(?:\s*stamp)?/i,
    LOSCAM: /loscam/i,
    SECURITY: /security(?:\s*stamp)?/i
  },

  /**
   * Required documents by pallet scenario
   */
  requiredDocuments: {
    WITH_PALLETS: [
      'PALLET_NOTIFICATION_LETTER',
      'LOSCAM_DOCUMENT',
      'CUSTOMER_PALLET_RECEIVING',
      'SHIP_DOCUMENT',
      'INVOICE',
      'RAR'
    ] as DocumentType[],
    WITHOUT_PALLETS: [
      'SHIP_DOCUMENT',
      'INVOICE',
      'RAR'
    ] as DocumentType[]
  },

  /**
   * Ship Document Requirements by Scenario
   */
  shipDocumentRequirements: {
    WITH_PALLETS: {
      stamps: ['DISPATCH', 'PALLET'] as StampType[],
      signatures: ['SECURITY'] as SignatureType[],
      fields: ['time-out'] // Expected text fields
    },
    WITHOUT_PALLETS: {
      stamps: ['DISPATCH', 'NO_PALLET'] as StampType[],
      signatures: [] as SignatureType[],
      fields: []
    }
  },

  /**
   * Pallet Document Requirements
   * Only applicable when WITH_PALLETS scenario is detected
   */
  palletDocumentRequirements: {
    PALLET_NOTIFICATION_LETTER: {
      stamps: ['WAREHOUSE'] as StampType[],
      signatures: ['WAREHOUSE_STAFF'] as SignatureType[],
      description: 'Pallet Notification Letter must have warehouse stamp and warehouse staff signature'
    },
    LOSCAM_DOCUMENT: {
      stamps: ['LOSCAM'] as StampType[],
      signatures: ['CUSTOMER'] as SignatureType[],
      description: 'Loscam Document must have loscam stamp and customer signature'
    },
    CUSTOMER_PALLET_RECEIVING: {
      stamps: [] as StampType[],
      signatures: [] as SignatureType[],
      description: 'Customer Pallet Receiving Document must be present'
    }
  },

  /**
   * Invoice vs RAR Validation Settings
   */
  invoiceRARValidation: {
    // Fields to compare between Invoice and RAR
    compareFields: ['poNumber', 'totalCases'],

    // Whether to perform item-by-item comparison
    compareItems: true,

    // Allowed variance percentage (Super 8 has ZERO tolerance)
    allowedVariancePercent: 0,

    // Whether to validate page count
    validatePageCount: true,

    // PO number extraction patterns
    poNumberPatterns: [
      /PO\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
      /Purchase\s*Order\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
      /P\.O\.\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
      /PO\s*Number\s*:?\s*([A-Z0-9\-]+)/i
    ],

    // Total cases extraction patterns
    totalCasesPatterns: [
      /Total\s*Cases\s*:?\s*(\d+)/i,
      /Total\s*Qty\s*:?\s*(\d+)/i,
      /Total\s*Quantity\s*:?\s*(\d+)/i,
      /Cases\s*:?\s*(\d+)/i
    ]
  },

  /**
   * Classification Settings
   */
  classification: {
    // Minimum confidence threshold for document classification (%)
    minimumConfidence: 70,

    // Status to assign when document type is unknown
    unknownDocumentStatus: 'REVIEW' as 'PASS' | 'REVIEW' | 'FAIL',

    // Whether to flag documents with low classification confidence
    flagLowConfidence: true,

    // Confidence threshold for flagging (%)
    lowConfidenceThreshold: 80
  },

  /**
   * Signature Detection Configuration
   * Controls how image-based and text-based signature detections are merged
   */
  signatureDetection: {
    // Enable merging of image-based and text-based detection
    enableMerging: true,

    // Confidence weights when merging both detection types
    // Text-based: more reliable for signature type identification
    // Image-based: proves physical signature actually exists
    mergeWeights: {
      textBased: 0.6,  // 60% weight for text-based detection
      imageBased: 0.4  // 40% weight for image-based detection
    },

    // Minimum confidence thresholds
    minImageConfidence: 30,  // Only use image detections with confidence >= 30%
    minTextConfidence: 50,   // Only use text detections with confidence >= 50%

    // Logging
    verboseLogging: true  // Enable detailed merge operation logs
  },

  /**
   * Peculiarity Severity Mapping
   * Determines how serious each type of issue is for Super 8
   */
  peculiaritySeverity: {
    // Document-related
    missingRequiredDocument: 'HIGH' as 'HIGH',
    documentTypeUnknown: 'MEDIUM' as 'MEDIUM',
    extraUnexpectedDocument: 'LOW' as 'LOW',

    // Stamp-related
    missingStamp: 'HIGH' as 'HIGH',
    missingSignature: 'HIGH' as 'HIGH',

    // Cross-document validation
    crossDocumentMismatch: 'HIGH' as 'HIGH',
    poNumberMismatch: 'HIGH' as 'HIGH',
    totalCasesMismatch: 'HIGH' as 'HIGH',
    itemQuantityMismatch: 'HIGH' as 'HIGH',

    // Pallet-related
    conflictingPalletInformation: 'HIGH' as 'HIGH',
    palletDocumentMissing: 'HIGH' as 'HIGH',

    // OCR/Quality
    lowOCRConfidence: 'MEDIUM' as 'MEDIUM',
    poorImageQuality: 'MEDIUM' as 'MEDIUM',

    // Other
    missingRequiredField: 'MEDIUM' as 'MEDIUM',
    templateUnknown: 'LOW' as 'LOW'
  },

  /**
   * Pallet Detection Logic
   * How to determine if a delivery has pallets
   */
  palletDetection: {
    // Detection methods (in order of priority)
    methods: [
      'PALLET_NOTIFICATION_LETTER_PRESENT', // If Pallet Notification Letter is present
      'PALLET_STAMP_PRESENT',                // If any document has PALLET stamp
      'NO_PALLET_STAMP_ABSENT'               // If NO_PALLET stamp is absent
    ],

    // What to do if conflicting information is found
    // (e.g., Pallet Notification Letter present but Ship Document has NO_PALLET stamp)
    conflictResolution: 'FLAG_FOR_REVIEW' as 'FLAG_FOR_REVIEW' | 'ASSUME_WITH_PALLETS' | 'ASSUME_WITHOUT_PALLETS'
  },

  /**
   * Time-out Field Detection
   * For Ship Document validation
   */
  timeOutFieldPatterns: [
    /time[\s\-]?out\s*:?\s*(\d{1,2}:\d{2})/i,
    /time[\s\-]?out\s*:?\s*(\d{1,2}\s*(?:AM|PM))/i,
    /departure\s*time\s*:?\s*(\d{1,2}:\d{2})/i
  ],

  /**
   * Status Determination Rules
   * How to determine overall delivery status based on peculiarities
   */
  statusRules: {
    // If any HIGH severity peculiarity → REVIEW
    highSeverityTriggersReview: true,

    // Number of MEDIUM severity peculiarities that trigger REVIEW
    mediumSeverityThreshold: 2,

    // Whether any peculiarity triggers REVIEW (strict mode)
    anyPeculiarityTriggersReview: false, // Super 8 uses threshold-based approach

    // Whether missing documents should immediately FAIL (vs REVIEW)
    missingDocumentsFail: false // Super 8 prefers REVIEW for manual check
  }
};

/**
 * Export type for external use
 */
export type Super8ValidationConfig = typeof Super8ValidationRules;
