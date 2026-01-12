import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { AppError } from './error-handler';

/**
 * File type magic numbers (first few bytes of file)
 * Used for validating actual file content, not just extension
 */
const fileMagicNumbers: Record<string, Buffer[]> = {
  jpg: [Buffer.from([0xFF, 0xD8, 0xFF])],
  png: [Buffer.from([0x89, 0x50, 0x4E, 0x47])],
  gif: [Buffer.from([0x47, 0x49, 0x46, 0x38])],
  bmp: [Buffer.from([0x42, 0x4D])],
  tiff: [Buffer.from([0x49, 0x49, 0x2A, 0x00]), Buffer.from([0x4D, 0x4D, 0x00, 0x2A])],
  pdf: [Buffer.from([0x25, 0x50, 0x44, 0x46])],
  zip: [Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from([0x50, 0x4B, 0x05, 0x06])], // Excel xlsx is zip-based
};

/**
 * Check if buffer starts with any of the given magic numbers
 */
const matchesMagicNumber = (buffer: Buffer, magicNumbers: Buffer[]): boolean => {
  return magicNumbers.some((magic) => {
    if (buffer.length < magic.length) return false;
    return buffer.subarray(0, magic.length).equals(magic);
  });
};

/**
 * Validate file content using magic numbers
 */
const validateFileContent = async (filePath: string, mimeType: string): Promise<boolean> => {
  const buffer = Buffer.alloc(8);
  const fd = await fs.promises.open(filePath, 'r');

  try {
    await fd.read(buffer, 0, 8, 0);
    await fd.close();

    // Check magic numbers based on MIME type
    if (mimeType.startsWith('image/jpeg')) {
      return matchesMagicNumber(buffer, fileMagicNumbers.jpg);
    } else if (mimeType === 'image/png') {
      return matchesMagicNumber(buffer, fileMagicNumbers.png);
    } else if (mimeType === 'image/gif') {
      return matchesMagicNumber(buffer, fileMagicNumbers.gif);
    } else if (mimeType === 'image/bmp') {
      return matchesMagicNumber(buffer, fileMagicNumbers.bmp);
    } else if (mimeType.startsWith('image/tiff')) {
      return matchesMagicNumber(buffer, fileMagicNumbers.tiff);
    } else if (mimeType === 'application/pdf') {
      return matchesMagicNumber(buffer, fileMagicNumbers.pdf);
    } else if (mimeType.includes('spreadsheetml') || mimeType.includes('excel')) {
      // Excel .xlsx files are zip-based
      return matchesMagicNumber(buffer, fileMagicNumbers.zip);
    } else if (mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel') {
      // CSV files are plain text, skip magic number check
      return true;
    }

    return true; // Default to true for other types
  } catch (error) {
    console.error('Error validating file content:', error);
    return false;
  }
};

/**
 * Middleware to validate uploaded files
 */
export const validateUploadedFiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
      throw new AppError('No files uploaded', 400, 'NO_FILES_UPLOADED');
    }

    const files = req.files as Express.Multer.File[];

    // Validate each file
    for (const file of files) {
      // Check file size
      if (file.size === 0) {
        throw new AppError(
          `File ${file.originalname} is empty`,
          400,
          'EMPTY_FILE'
        );
      }

      // Validate file content matches declared MIME type
      const isValid = await validateFileContent(file.path, file.mimetype);
      if (!isValid) {
        throw new AppError(
          `File ${file.originalname} content does not match declared type ${file.mimetype}`,
          400,
          'INVALID_FILE_CONTENT'
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to ensure files were uploaded
 */
export const requireFiles = (req: Request, res: Response, next: NextFunction) => {
  if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
    return next(new AppError('No files uploaded', 400, 'NO_FILES_UPLOADED'));
  }
  next();
};
