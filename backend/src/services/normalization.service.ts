import {
  NormalizedPODData,
  DeliveryItem,
} from "../../../shared/types/pod-schema";
import { createModuleLogger } from "../middleware/logger";

const logger = createModuleLogger("NormalizationService");

/**
 * Extract delivery date from text
 */
const extractDeliveryDate = (text: string): Date | null => {
  try {
    // Common date patterns
    const datePatterns = [
      // MM/DD/YYYY or MM-DD-YYYY
      /(?:delivery\s*date|date|delivered|shipped)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      // DD/MM/YYYY or DD-MM-YYYY
      /(?:delivery\s*date|date|delivered|shipped)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      // Month DD, YYYY
      /(?:delivery\s*date|date|delivered|shipped)[\s:]*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})/i,
      // YYYY-MM-DD
      /(?:delivery\s*date|date|delivered|shipped)[\s:]*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/i,
      // Standalone date patterns
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        const dateStr = match[1];
        const date = new Date(dateStr);

        if (!isNaN(date.getTime())) {
          logger.debug("Date extracted", { dateStr, date });
          return date;
        }
      }
    }

    return null;
  } catch (error) {
    logger.debug("Error extracting date", { error });
    return null;
  }
};

/**
 * Extract recipient name from text
 */
const extractRecipientName = (text: string): string | null => {
  const namePatterns = [
    /(?:recipient|customer|receiver|to|delivered\s*to)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
    /(?:name)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
  ];

  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 50) {
        logger.debug("Recipient name extracted", { name });
        return name;
      }
    }
  }

  return null;
};

/**
 * Extract recipient address from text
 */
const extractRecipientAddress = (text: string): string | null => {
  const addressPatterns = [
    /(?:address|ship\s*to|deliver\s*to)[\s:]+([^\n]{10,100})/i,
    /(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)[^\n]{0,50})/i,
  ];

  for (const pattern of addressPatterns) {
    const match = text.match(pattern);
    if (match) {
      const address = match[1].trim();
      if (address.length > 10 && address.length < 200) {
        logger.debug("Address extracted", { address });
        return address;
      }
    }
  }

  return null;
};

/**
 * Extract driver name from text
 */
const extractDriverName = (text: string): string | null => {
  const driverPatterns = [
    /(?:driver|delivered\s*by|courier)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
  ];

  for (const pattern of driverPatterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      if (name.length > 2 && name.length < 50) {
        logger.debug("Driver name extracted", { name });
        return name;
      }
    }
  }

  return null;
};

/**
 * Extract delivery items from text
 */
const extractDeliveryItems = (text: string): DeliveryItem[] => {
  const items: DeliveryItem[] = [];

  // Pattern for item lines with code and quantity
  // Examples:
  // - "SKU123 Widget Item 5 pcs"
  // - "ITEM-456 Product Name x3"
  // - "ABC123 Description Qty: 10"
  const itemPatterns = [
    // SKU/Code followed by description and quantity
    /([A-Z0-9\-]{3,15})\s+([A-Za-z\s]{3,40})\s+(?:qty|quantity|x|pcs|pc|pieces)?[\s:]*(\d+)/gi,
    // Item code: Description Qty: number
    /(?:item|sku|code)[\s:]*([A-Z0-9\-]{3,15})\s+([A-Za-z\s]{3,40})\s+(?:qty|quantity)[\s:]*(\d+)/gi,
    // Simple: Description (number)
    /([A-Za-z\s]{5,40})\s+\((\d+)\)/gi,
  ];

  for (const pattern of itemPatterns) {
    let match;
    const regex = new RegExp(pattern);

    while ((match = regex.exec(text)) !== null) {
      const item: DeliveryItem = {};

      if (match.length >= 3) {
        // Has item code
        item.itemCode = match[1].trim();
        item.description = match[2].trim();
        item.deliveredQuantity = parseInt(match[3]);
      } else if (match.length === 2) {
        // No item code, just description and quantity
        item.description = match[1].trim();
        item.deliveredQuantity = parseInt(match[2]);
      }

      if (item.description && item.deliveredQuantity) {
        items.push(item);
      }
    }
  }

  // Also look for table-like structures
  const lines = text.split("\n");
  const tableItems = extractItemsFromTable(lines);
  items.push(...tableItems);

  // Remove duplicates based on description
  const uniqueItems = items.filter(
    (item, index, self) =>
      index ===
      self.findIndex(
        (t) =>
          t.description === item.description && t.itemCode === item.itemCode
      )
  );

  // Filter out header rows and garbage data
  const validItems = uniqueItems.filter((item) => !isHeaderOrGarbageItem(item));

  logger.debug("Items extracted", {
    total: uniqueItems.length,
    valid: validItems.length,
    filtered: uniqueItems.length - validItems.length,
  });

  return validItems;
};

/**
 * Check if a line/item is likely a header row or garbage data
 */
const isHeaderOrGarbageItem = (item: DeliveryItem): boolean => {
  const description = (item.description || "").toLowerCase();
  const itemCode = (item.itemCode || "").toLowerCase();
  const qty = item.deliveredQuantity || 0;

  // Common header keywords
  const headerKeywords = [
    "description",
    "item",
    "product",
    "sku",
    "code",
    "qty",
    "quantity",
    "unit",
    "price",
    "amount",
    "total",
    "subtotal",
    "variance",
    "date",
    "delivery",
    "invoice",
    "po number",
    "customer",
    "terms",
    "billing",
    "address",
    "remarks",
    "must",
    "payable",
    "order",
  ];

  // Check if description matches header keywords
  for (const keyword of headerKeywords) {
    if (description.includes(keyword) && description.length < 50) {
      return true;
    }
  }

  // Check for year/date patterns (e.g., 2024, 2025, 2026)
  if (qty >= 2020 && qty <= 2030) {
    return true;
  }

  // Suspiciously high quantities (likely line numbers or dates)
  if (qty > 500) {
    return true;
  }

  // Item code looks like a header
  if (headerKeywords.some((kw) => itemCode.includes(kw))) {
    return true;
  }

  // Description is too short or looks like gibberish
  if (description.length < 3 || description.length > 100) {
    return true;
  }

  // Item code with quantity 0 or missing
  if (!itemCode && !qty) {
    return true;
  }

  return false;
};

/**
 * Extract items from table-like structure
 */
const extractItemsFromTable = (lines: string[]): DeliveryItem[] => {
  const items: DeliveryItem[] = [];

  // Look for header row
  const headerIndex = lines.findIndex((line) =>
    /item|product|description|qty|quantity|sku|code/i.test(line)
  );

  if (headerIndex === -1) {
    return items;
  }

  // Parse data rows after header
  for (
    let i = headerIndex + 1;
    i < Math.min(headerIndex + 20, lines.length);
    i++
  ) {
    const line = lines[i].trim();

    if (!line || line.length < 3) continue;

    // Split by multiple spaces or tabs
    const parts = line.split(/\s{2,}|\t+/);

    if (parts.length >= 2) {
      const item: DeliveryItem = {};

      // Try to identify columns
      for (const part of parts) {
        // Is it a number? (quantity)
        if (/^\d+$/.test(part.trim())) {
          const qty = parseInt(part);
          // Only accept reasonable quantities (1-500)
          if (qty > 0 && qty <= 500) {
            item.deliveredQuantity = qty;
          }
        }
        // Is it an item code? (alphanumeric with dashes)
        else if (/^[A-Z0-9\-]{3,15}$/i.test(part.trim())) {
          item.itemCode = part.trim();
        }
        // Is it a description? (longer text)
        else if (part.length > 3) {
          item.description = part.trim();
        }
      }

      // Filter out header rows and garbage
      if ((item.description || item.itemCode) && !isHeaderOrGarbageItem(item)) {
        items.push(item);
      }
    }
  }

  return items;
};

/**
 * Extract total cases from document summary (fallback method)
 */
const extractTotalCasesFromSummary = (text: string): number | null => {
  const totalPatterns = [
    /total\s*cases?[\s:]+?(\d{1,4})/i,
    /total\s*qty[\s:]+?(\d{1,4})/i,
    /total\s*quantity[\s:]+?(\d{1,4})/i,
    /grand\s*total[\s:]+?(\d{1,4})/i,
    /cases?[\s:]+total[\s:]+?(\d{1,4})/i,
    /sum[\s:]+?(\d{1,4})\s*cases?/i,
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match) {
      const total = parseInt(match[1]);
      // Reasonable total range (1-500 cases)
      if (total > 0 && total <= 500) {
        logger.debug("Total cases extracted from summary", { total });
        return total;
      }
    }
  }

  return null;
};

/**
 * Extract remarks/notes from text
 */
const extractRemarks = (text: string): string | null => {
  const remarksPatterns = [
    /(?:remarks?|notes?|comments?)[\s:]+([^\n]{10,200})/i,
    /(?:special\s*instructions?)[\s:]+([^\n]{10,200})/i,
  ];

  for (const pattern of remarksPatterns) {
    const match = text.match(pattern);
    if (match) {
      const remarks = match[1].trim();
      logger.debug("Remarks extracted", { remarks });
      return remarks;
    }
  }

  return null;
};

/**
 * Normalize quantity string to number
 * Handles: "5 pcs", "5pc", "5 pieces", "x5", etc.
 */
export const normalizeQuantity = (quantityStr: string): number | undefined => {
  if (!quantityStr) return undefined;

  // Remove common quantity units
  const cleaned = quantityStr
    .toLowerCase()
    .replace(/\s*(pcs|pc|pieces|piece|units?|items?|x)\s*/g, "")
    .trim();

  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
};

/**
 * Main normalization function
 * Extracts structured data from raw OCR text
 */
export const normalizeOCRText = (ocrText: string): NormalizedPODData => {
  try {
    logger.info("Normalizing OCR text", { textLength: ocrText.length });

    const normalized: NormalizedPODData = {
      deliveryDate: extractDeliveryDate(ocrText),
      recipientName: extractRecipientName(ocrText),
      recipientAddress: extractRecipientAddress(ocrText),
      driverName: extractDriverName(ocrText),
      items: extractDeliveryItems(ocrText),
      remarks: extractRemarks(ocrText),
    };

    logger.info("OCR text normalized", {
      hasDate: !!normalized.deliveryDate,
      hasRecipient: !!normalized.recipientName,
      hasAddress: !!normalized.recipientAddress,
      hasDriver: !!normalized.driverName,
      itemCount: normalized.items.length,
      hasRemarks: !!normalized.remarks,
    });

    return normalized;
  } catch (error) {
    logger.error("Error normalizing OCR text", { error });

    // Return empty normalized data on error
    return {
      deliveryDate: null,
      recipientName: null,
      recipientAddress: null,
      driverName: null,
      items: [],
      remarks: null,
    };
  }
};

/**
 * Merge normalized data from multiple sources
 * Prioritizes non-null values
 */
export const mergeNormalizedData = (
  ...dataSources: NormalizedPODData[]
): NormalizedPODData => {
  const merged: NormalizedPODData = {
    deliveryDate: null,
    recipientName: null,
    recipientAddress: null,
    driverName: null,
    items: [],
    remarks: null,
  };

  for (const data of dataSources) {
    if (!merged.deliveryDate && data.deliveryDate) {
      merged.deliveryDate = data.deliveryDate;
    }
    if (!merged.recipientName && data.recipientName) {
      merged.recipientName = data.recipientName;
    }
    if (!merged.recipientAddress && data.recipientAddress) {
      merged.recipientAddress = data.recipientAddress;
    }
    if (!merged.driverName && data.driverName) {
      merged.driverName = data.driverName;
    }
    if (data.items.length > 0) {
      merged.items.push(...data.items);
    }
    if (!merged.remarks && data.remarks) {
      merged.remarks = data.remarks;
    }
  }

  // Remove duplicate items
  const uniqueItems = merged.items.filter(
    (item, index, self) =>
      index ===
      self.findIndex(
        (t) =>
          t.description === item.description && t.itemCode === item.itemCode
      )
  );

  merged.items = uniqueItems;

  return merged;
};

// Export helper functions for use in validators
export {
  extractTotalCasesFromSummary,
  isHeaderOrGarbageItem,
  extractDeliveryDate,
  extractRecipientName,
  extractDeliveryItems,
  extractRemarks,
};
