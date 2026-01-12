/**
 * Cross-Document Comparison Service
 *
 * Reusable utilities for comparing data across multiple documents.
 * This service provides common comparison functions that can be used
 * by any customer-specific validator.
 */

import { IPODModel } from '../models/pod.model';
import { DeliveryItem } from '../../../shared/types/pod-schema';
import { createModuleLogger } from '../middleware/logger';

const logger = createModuleLogger('CrossDocumentComparisonService');

/**
 * Comparison Result Interface
 */
export interface ComparisonResult {
  match: boolean;
  value1: any;
  value2: any;
  difference?: any;
}

/**
 * Item Discrepancy Interface
 */
export interface ItemDiscrepancy {
  itemCode: string;
  issue: string;
  value1: number;
  value2: number;
  difference?: number;
}

/**
 * Extract PO Number from document text
 */
export const extractPONumber = (text: string, patterns?: RegExp[]): string | null => {
  const defaultPatterns = [
    /PO\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
    /Purchase\s*Order\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
    /P\.O\.\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
    /PO\s*Number\s*:?\s*([A-Z0-9\-]+)/i,
    /Order\s*#?\s*:?\s*([A-Z0-9\-]+)/i
  ];

  const patternsToUse = patterns || defaultPatterns;

  for (const pattern of patternsToUse) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
};

/**
 * Extract total cases/quantity from document text
 */
export const extractTotalCases = (text: string, patterns?: RegExp[]): number | null => {
  const defaultPatterns = [
    /Total\s*Cases\s*:?\s*(\d+)/i,
    /Total\s*Qty\s*:?\s*(\d+)/i,
    /Total\s*Quantity\s*:?\s*(\d+)/i,
    /Cases\s*:?\s*(\d+)/i,
    /Total\s*:?\s*(\d+)\s*(?:cases|pcs|units)/i
  ];

  const patternsToUse = patterns || defaultPatterns;

  for (const pattern of patternsToUse) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return null;
};

/**
 * Extract invoice number from document text
 */
export const extractInvoiceNumber = (text: string): string | null => {
  const patterns = [
    /Invoice\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
    /Inv\s*#?\s*:?\s*([A-Z0-9\-]+)/i,
    /Invoice\s*Number\s*:?\s*([A-Z0-9\-]+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
};

/**
 * Compare PO numbers between two documents
 */
export const comparePONumbers = (
  doc1: IPODModel,
  doc2: IPODModel,
  patterns?: RegExp[]
): ComparisonResult => {
  const po1 = extractPONumber(doc1.extractedData.rawText || '', patterns);
  const po2 = extractPONumber(doc2.extractedData.rawText || '', patterns);

  return {
    match: po1 !== null && po2 !== null && po1 === po2,
    value1: po1,
    value2: po2
  };
};

/**
 * Compare total cases between two documents
 */
export const compareTotalCases = (
  doc1: IPODModel,
  doc2: IPODModel,
  patterns?: RegExp[]
): ComparisonResult => {
  const cases1 = extractTotalCases(doc1.extractedData.rawText || '', patterns);
  const cases2 = extractTotalCases(doc2.extractedData.rawText || '', patterns);

  return {
    match: cases1 !== null && cases2 !== null && cases1 === cases2,
    value1: cases1,
    value2: cases2,
    difference: cases1 !== null && cases2 !== null ? cases1 - cases2 : null
  };
};

/**
 * Compare item lists between two documents
 */
export const compareItemLists = (
  items1: DeliveryItem[],
  items2: DeliveryItem[],
  allowedVariancePercent: number = 0
): ItemDiscrepancy[] => {
  const discrepancies: ItemDiscrepancy[] = [];

  // Check each item in first list
  items1.forEach(item1 => {
    const item2 = items2.find(i => i.itemCode === item1.itemCode);

    if (!item2) {
      // Item in first list but not in second
      discrepancies.push({
        itemCode: item1.itemCode || 'UNKNOWN',
        issue: 'Item in first document but not in second',
        value1: item1.deliveredQuantity || item1.expectedQuantity || 0,
        value2: 0,
        difference: item1.deliveredQuantity || item1.expectedQuantity || 0
      });
    } else {
      // Item exists in both, compare quantities
      const qty1 = item1.deliveredQuantity || item1.expectedQuantity || 0;
      const qty2 = item2.deliveredQuantity || item2.expectedQuantity || 0;

      if (qty1 !== qty2) {
        // Calculate variance percentage
        const variance = qty2 !== 0 ? Math.abs((qty1 - qty2) / qty2) * 100 : 100;

        if (variance > allowedVariancePercent) {
          discrepancies.push({
            itemCode: item1.itemCode || 'UNKNOWN',
            issue: `Quantity mismatch (${variance.toFixed(1)}% variance)`,
            value1: qty1,
            value2: qty2,
            difference: qty1 - qty2
          });
        }
      }
    }
  });

  // Check for items in second list but not in first
  items2.forEach(item2 => {
    const item1 = items1.find(i => i.itemCode === item2.itemCode);
    if (!item1) {
      discrepancies.push({
        itemCode: item2.itemCode || 'UNKNOWN',
        issue: 'Item in second document but not in first',
        value1: 0,
        value2: item2.deliveredQuantity || item2.expectedQuantity || 0,
        difference: -(item2.deliveredQuantity || item2.expectedQuantity || 0)
      });
    }
  });

  return discrepancies;
};

/**
 * Compare two documents for specific field
 */
export const compareField = (
  doc1: IPODModel,
  doc2: IPODModel,
  fieldPath: string
): ComparisonResult => {
  const getValue = (doc: IPODModel, path: string): any => {
    const keys = path.split('.');
    let value: any = doc;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }

    return value;
  };

  const value1 = getValue(doc1, fieldPath);
  const value2 = getValue(doc2, fieldPath);

  return {
    match: value1 !== null && value2 !== null && value1 === value2,
    value1,
    value2
  };
};

/**
 * Extract date from document text
 */
export const extractDate = (text: string): Date | null => {
  const patterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        // Try to parse date
        const dateStr = match[0];
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
      } catch (error) {
        // Continue to next pattern
      }
    }
  }

  return null;
};

/**
 * Calculate percentage difference between two numbers
 */
export const calculatePercentageDifference = (value1: number, value2: number): number => {
  if (value2 === 0) {
    return value1 === 0 ? 0 : 100;
  }

  return Math.abs((value1 - value2) / value2) * 100;
};

/**
 * Check if two values are within acceptable variance
 */
export const isWithinVariance = (
  value1: number,
  value2: number,
  allowedVariancePercent: number
): boolean => {
  const variance = calculatePercentageDifference(value1, value2);
  return variance <= allowedVariancePercent;
};

/**
 * Summary comparison between two documents
 */
export interface DocumentComparisonSummary {
  poNumberMatch: boolean;
  totalCasesMatch: boolean;
  itemsMatch: boolean;
  itemDiscrepancies: ItemDiscrepancy[];
  overallMatch: boolean;
}

/**
 * Comprehensive comparison between two documents
 */
export const compareDocuments = (
  doc1: IPODModel,
  doc2: IPODModel,
  options: {
    comparePONumber?: boolean;
    compareTotalCases?: boolean;
    compareItems?: boolean;
    allowedVariancePercent?: number;
    poNumberPatterns?: RegExp[];
    totalCasesPatterns?: RegExp[];
  } = {}
): DocumentComparisonSummary => {
  const {
    comparePONumber: shouldComparePONumber = true,
    compareTotalCases: shouldCompareTotalCases = true,
    compareItems: shouldCompareItems = true,
    allowedVariancePercent = 0,
    poNumberPatterns,
    totalCasesPatterns
  } = options;

  const summary: DocumentComparisonSummary = {
    poNumberMatch: true,
    totalCasesMatch: true,
    itemsMatch: true,
    itemDiscrepancies: [],
    overallMatch: true
  };

  // Compare PO numbers
  if (shouldComparePONumber) {
    const poComparison = comparePONumbers(doc1, doc2, poNumberPatterns);
    summary.poNumberMatch = poComparison.match;
    if (!poComparison.match) {
      summary.overallMatch = false;
    }
  }

  // Compare total cases
  if (shouldCompareTotalCases) {
    const casesComparison = compareTotalCases(doc1, doc2, totalCasesPatterns);
    summary.totalCasesMatch = casesComparison.match;
    if (!casesComparison.match) {
      summary.overallMatch = false;
    }
  }

  // Compare items
  if (shouldCompareItems) {
    const items1 = doc1.extractedData.normalized.items || [];
    const items2 = doc2.extractedData.normalized.items || [];

    if (items1.length > 0 && items2.length > 0) {
      const discrepancies = compareItemLists(items1, items2, allowedVariancePercent);
      summary.itemDiscrepancies = discrepancies;
      summary.itemsMatch = discrepancies.length === 0;
      if (discrepancies.length > 0) {
        summary.overallMatch = false;
      }
    }
  }

  return summary;
};
