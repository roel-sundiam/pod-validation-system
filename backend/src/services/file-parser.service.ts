import xlsx from 'xlsx';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import { NormalizedPODData, DeliveryItem } from '../../../shared/types/pod-schema';
import { createModuleLogger } from '../middleware/logger';

const logger = createModuleLogger('FileParserService');

/**
 * Parsed Structured Data
 */
export interface ParsedData {
  headers: string[];
  rows: Record<string, any>[];
  rawData: any[][];
}

/**
 * Parse Excel file (.xls, .xlsx)
 */
export const parseExcelFile = async (filePath: string): Promise<ParsedData> => {
  try {
    logger.info('Parsing Excel file', { filePath });

    // Read file
    const workbook = xlsx.readFile(filePath);

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    if (jsonData.length === 0) {
      throw new Error('Excel file is empty');
    }

    // First row is headers
    const headers = jsonData[0].map(h => String(h || '').trim());
    const dataRows = jsonData.slice(1);

    // Convert to objects
    const rows = dataRows.map(row => {
      const obj: Record<string, any> = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });

    logger.info('Excel file parsed successfully', {
      filePath,
      headers,
      rowCount: rows.length,
    });

    return {
      headers,
      rows,
      rawData: jsonData,
    };
  } catch (error) {
    logger.error('Error parsing Excel file', { filePath, error });
    throw error;
  }
};

/**
 * Parse CSV file
 */
export const parseCSVFile = async (filePath: string): Promise<ParsedData> => {
  try {
    logger.info('Parsing CSV file', { filePath });

    // Read file
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');

    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });

    if (records.length === 0) {
      throw new Error('CSV file is empty');
    }

    // Extract headers from first record
    const headers = Object.keys(records[0]);

    logger.info('CSV file parsed successfully', {
      filePath,
      headers,
      rowCount: records.length,
    });

    return {
      headers,
      rows: records,
      rawData: [], // Not applicable for CSV parsed with columns
    };
  } catch (error) {
    logger.error('Error parsing CSV file', { filePath, error });
    throw error;
  }
};

/**
 * Parse structured file (auto-detect Excel or CSV)
 */
export const parseStructuredFile = async (filePath: string, mimeType: string): Promise<ParsedData> => {
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
    return await parseExcelFile(filePath);
  } else if (mimeType === 'text/csv' || filePath.endsWith('.csv')) {
    return await parseCSVFile(filePath);
  } else {
    throw new Error(`Unsupported structured file type: ${mimeType}`);
  }
};

/**
 * Common column name mappings
 * Maps various column names to standard fields
 */
const COLUMN_MAPPINGS: Record<string, string[]> = {
  deliveryDate: ['delivery date', 'date', 'delivery_date', 'shipped date', 'ship date'],
  recipientName: ['recipient', 'customer', 'receiver', 'recipient name', 'customer name', 'receiver name'],
  recipientAddress: ['address', 'recipient address', 'delivery address', 'customer address'],
  driverName: ['driver', 'driver name', 'delivered by', 'courier'],
  itemCode: ['item code', 'sku', 'product code', 'item', 'product', 'item_code'],
  description: ['description', 'item description', 'product description', 'item name'],
  quantity: ['quantity', 'qty', 'delivered quantity', 'delivered', 'amount'],
  expectedQuantity: ['expected quantity', 'expected qty', 'ordered quantity', 'ordered qty', 'expected'],
};

/**
 * Find matching column for a field
 */
const findMatchingColumn = (headers: string[], fieldVariants: string[]): string | null => {
  const normalizedHeaders = headers.map(h => h.toLowerCase());

  for (const variant of fieldVariants) {
    const index = normalizedHeaders.findIndex(h => h.includes(variant));
    if (index !== -1) {
      return headers[index];
    }
  }

  return null;
};

/**
 * Map parsed data to normalized POD format
 */
export const mapToNormalizedFormat = (parsedData: ParsedData): NormalizedPODData => {
  try {
    logger.info('Mapping parsed data to normalized format');

    const { headers, rows } = parsedData;

    // Find matching columns
    const dateColumn = findMatchingColumn(headers, COLUMN_MAPPINGS.deliveryDate);
    const recipientColumn = findMatchingColumn(headers, COLUMN_MAPPINGS.recipientName);
    const addressColumn = findMatchingColumn(headers, COLUMN_MAPPINGS.recipientAddress);
    const driverColumn = findMatchingColumn(headers, COLUMN_MAPPINGS.driverName);
    const itemCodeColumn = findMatchingColumn(headers, COLUMN_MAPPINGS.itemCode);
    const descriptionColumn = findMatchingColumn(headers, COLUMN_MAPPINGS.description);
    const quantityColumn = findMatchingColumn(headers, COLUMN_MAPPINGS.quantity);
    const expectedQuantityColumn = findMatchingColumn(headers, COLUMN_MAPPINGS.expectedQuantity);

    // Extract delivery-level information (from first row if available)
    const firstRow = rows[0] || {};
    const deliveryDate = dateColumn ? parseDate(firstRow[dateColumn]) : null;
    const recipientName = recipientColumn ? String(firstRow[recipientColumn] || '') : null;
    const recipientAddress = addressColumn ? String(firstRow[addressColumn] || '') : null;
    const driverName = driverColumn ? String(firstRow[driverColumn] || '') : null;

    // Extract items (from all rows)
    const items: DeliveryItem[] = rows.map(row => {
      const item: DeliveryItem = {};

      if (itemCodeColumn) {
        item.itemCode = String(row[itemCodeColumn] || '');
      }

      if (descriptionColumn) {
        item.description = String(row[descriptionColumn] || '');
      }

      if (quantityColumn) {
        item.deliveredQuantity = parseNumber(row[quantityColumn]);
      }

      if (expectedQuantityColumn) {
        item.expectedQuantity = parseNumber(row[expectedQuantityColumn]);
      }

      return item;
    }).filter(item => item.itemCode || item.description); // Filter out empty items

    const normalized: NormalizedPODData = {
      deliveryDate,
      recipientName,
      recipientAddress,
      driverName,
      items,
      remarks: null,
    };

    logger.info('Data mapped to normalized format', {
      hasDeliveryDate: !!deliveryDate,
      hasRecipient: !!recipientName,
      itemCount: items.length,
    });

    return normalized;
  } catch (error) {
    logger.error('Error mapping data to normalized format', { error });
    throw error;
  }
};

/**
 * Parse date from various formats
 */
const parseDate = (value: any): Date | null => {
  if (!value) return null;

  try {
    // Handle Excel date numbers
    if (typeof value === 'number') {
      // Excel dates are days since 1900-01-01
      const excelEpoch = new Date(1900, 0, 1);
      const date = new Date(excelEpoch.getTime() + (value - 2) * 24 * 60 * 60 * 1000);
      return date;
    }

    // Handle string dates
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  } catch (error) {
    return null;
  }
};

/**
 * Parse number from string
 */
const parseNumber = (value: any): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? undefined : num;
};

/**
 * Get raw text representation of structured data
 */
export const structuredDataToText = (parsedData: ParsedData): string => {
  const { headers, rows } = parsedData;

  const lines: string[] = [];

  // Add headers
  lines.push(headers.join(' | '));
  lines.push('-'.repeat(headers.join(' | ').length));

  // Add rows
  rows.forEach(row => {
    const values = headers.map(h => String(row[h] || ''));
    lines.push(values.join(' | '));
  });

  return lines.join('\n');
};
