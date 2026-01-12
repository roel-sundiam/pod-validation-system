import { fromPath } from 'pdf2pic';
import pdfParse from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import { createModuleLogger } from '../middleware/logger';

const logger = createModuleLogger('PDFConverter');

/**
 * Check if PDF contains extractable text
 */
export const hasExtractableText = async (pdfPath: string): Promise<boolean> => {
  try {
    const dataBuffer = await fs.promises.readFile(pdfPath);
    const data = await pdfParse(dataBuffer);

    // If text length is substantial, it's likely text-based PDF
    const hasText = data.text.trim().length > 50;

    logger.info('PDF text extraction check', {
      pdfPath,
      textLength: data.text.length,
      hasText,
    });

    return hasText;
  } catch (error) {
    logger.error('Error checking PDF text', { pdfPath, error });
    return false;
  }
};

/**
 * Extract text directly from PDF
 */
export const extractTextFromPDF = async (pdfPath: string): Promise<string> => {
  try {
    const dataBuffer = await fs.promises.readFile(pdfPath);
    const data = await pdfParse(dataBuffer);

    logger.info('Text extracted from PDF', {
      pdfPath,
      pages: data.numpages,
      textLength: data.text.length,
    });

    return data.text;
  } catch (error) {
    logger.error('Error extracting text from PDF', { pdfPath, error });
    throw error;
  }
};

/**
 * Convert PDF pages to images
 * Returns array of image file paths
 */
export const convertPDFToImages = async (
  pdfPath: string,
  outputDir?: string
): Promise<string[]> => {
  try {
    // Use same directory as PDF if no output directory specified
    if (!outputDir) {
      outputDir = path.dirname(pdfPath);
    }

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const basename = path.basename(pdfPath, '.pdf');
    const outputBaseName = `${basename}_page`;

    // Configure pdf2pic
    const options = {
      density: 300, // DPI (higher = better quality but slower)
      saveFilename: outputBaseName,
      savePath: outputDir,
      format: 'png',
      width: 2480, // A4 at 300 DPI
      height: 3508,
    };

    const converter = fromPath(pdfPath, options);

    // Get number of pages
    const dataBuffer = await fs.promises.readFile(pdfPath);
    const pdfData = await pdfParse(dataBuffer);
    const pageCount = pdfData.numpages;

    logger.info('Converting PDF to images', {
      pdfPath,
      pageCount,
      outputDir,
    });

    // Convert all pages
    const imagePaths: string[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      try {
        const result = await converter(pageNumber, { responseType: 'image' });

        if (result && result.path) {
          imagePaths.push(result.path);
          logger.info(`Converted page ${pageNumber}/${pageCount}`, {
            outputPath: result.path,
          });
        }
      } catch (pageError) {
        logger.error(`Error converting page ${pageNumber}`, {
          pdfPath,
          pageNumber,
          error: pageError,
        });
        // Continue with other pages
      }
    }

    logger.info('PDF to image conversion complete', {
      pdfPath,
      pagesConverted: imagePaths.length,
      totalPages: pageCount,
    });

    return imagePaths;
  } catch (error) {
    logger.error('Error converting PDF to images', { pdfPath, error });
    throw error;
  }
};

/**
 * Get PDF page count
 */
export const getPDFPageCount = async (pdfPath: string): Promise<number> => {
  try {
    const dataBuffer = await fs.promises.readFile(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.numpages;
  } catch (error) {
    logger.error('Error getting PDF page count', { pdfPath, error });
    return 0;
  }
};
