#!/usr/bin/env ts-node
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DeliveryModel } from '../src/models/delivery.model';
import { PODModel } from '../src/models/pod.model';
import { DocumentType } from '../../shared/types/pod-schema';

// Load environment variables
dotenv.config();

/**
 * RAR Keywords Configuration (from document-classification.service.ts)
 */
const RAR_KEYWORDS = {
  primary: ['RAR', 'receiving and acknowledgment', 'acknowledgment receipt', 'R.A.R.', 'R & A receipt'],
  secondary: ['received', 'acknowledged', 'total cases', 'receiving report'],
  weight: { primary: 10, secondary: 2 }
};

const MINIMUM_CONFIDENCE_THRESHOLD = 25;

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

/**
 * Utility functions for colored output
 */
function success(text: string): string {
  return `${colors.green}✓${colors.reset} ${text}`;
}

function error(text: string): string {
  return `${colors.red}✗${colors.reset} ${text}`;
}

function warning(text: string): string {
  return `${colors.yellow}⚠${colors.reset} ${text}`;
}

function header(text: string): string {
  return `\n${colors.bold}${colors.cyan}===== ${text} =====${colors.reset}\n`;
}

function subheader(text: string): string {
  return `\n${colors.bold}${text}${colors.reset}`;
}

/**
 * Calculate keyword matches and confidence score for RAR detection
 */
function analyzeRARKeywords(text: string): {
  score: number;
  confidence: number;
  primaryMatches: string[];
  secondaryMatches: string[];
  primaryMissing: string[];
  secondaryMissing: string[];
} {
  const lowerText = text.toLowerCase();
  const primaryMatches: string[] = [];
  const secondaryMatches: string[] = [];
  const primaryMissing: string[] = [];
  const secondaryMissing: string[] = [];
  let score = 0;

  // Check primary keywords
  for (const keyword of RAR_KEYWORDS.primary) {
    if (lowerText.includes(keyword.toLowerCase())) {
      score += RAR_KEYWORDS.weight.primary;
      primaryMatches.push(keyword);
    } else {
      primaryMissing.push(keyword);
    }
  }

  // Check secondary keywords
  for (const keyword of RAR_KEYWORDS.secondary) {
    if (lowerText.includes(keyword.toLowerCase())) {
      score += RAR_KEYWORDS.weight.secondary;
      secondaryMatches.push(keyword);
    } else {
      secondaryMissing.push(keyword);
    }
  }

  // Calculate maximum possible score
  const maxScore =
    (RAR_KEYWORDS.primary.length * RAR_KEYWORDS.weight.primary) +
    (RAR_KEYWORDS.secondary.length * RAR_KEYWORDS.weight.secondary);

  const confidence = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  return {
    score,
    confidence,
    primaryMatches,
    secondaryMatches,
    primaryMissing,
    secondaryMissing,
  };
}

/**
 * Connect to MongoDB
 */
async function connectDB(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pod_validation';

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log(success('Connected to MongoDB'));
}

/**
 * Main diagnostic function
 */
async function diagnoseDelivery(deliveryRefOrId: string): Promise<void> {
  try {
    // Connect to database
    await connectDB();

    console.log(header('POD VALIDATION DIAGNOSTIC REPORT'));
    console.log(`Analyzing delivery: ${colors.bold}${deliveryRefOrId}${colors.reset}\n`);

    // Load delivery - try by ID first, then by reference
    let delivery;
    if (mongoose.Types.ObjectId.isValid(deliveryRefOrId)) {
      delivery = await DeliveryModel.findById(deliveryRefOrId);
    }
    if (!delivery) {
      delivery = await DeliveryModel.findOne({ deliveryReference: deliveryRefOrId });
    }

    if (!delivery) {
      console.log(error(`Delivery not found: ${deliveryRefOrId}`));
      console.log('\nTip: Use delivery reference (e.g., "DEL-1768032477231-5a7af62e") or MongoDB ObjectId');
      return;
    }

    // Display basic metadata
    console.log(`Delivery ID: ${delivery._id}`);
    console.log(`Delivery Reference: ${delivery.deliveryReference}`);
    console.log(`Status: ${delivery.status}`);
    console.log(`Client: ${delivery.clientIdentifier || 'N/A'}`);
    console.log(`Uploaded: ${delivery.uploadedAt.toLocaleString()}`);
    console.log(`Documents: ${delivery.documents.length}`);

    // Phase B: Document Inventory
    console.log(header('DOCUMENT INVENTORY'));

    const unknownDocs: any[] = [];
    const rarDocs: any[] = [];

    for (let i = 0; i < delivery.documents.length; i++) {
      const docRef = delivery.documents[i];
      const pod = await PODModel.findById(docRef.podId);

      if (!pod) {
        console.log(`\nDocument ${i + 1}: ${error('POD not found')}`);
        console.log(`  POD ID: ${docRef.podId}`);
        continue;
      }

      const filename = pod.fileMetadata.originalName;
      const detectedType = docRef.detectedType || 'NOT_CLASSIFIED';
      const confidence = docRef.classificationConfidence || 0;

      console.log(`\nDocument ${i + 1}: ${filename}`);
      console.log(`  Status: ${pod.status}`);

      if (detectedType === 'UNKNOWN' || !docRef.detectedType) {
        console.log(`  Detected Type: ${error(`${detectedType} (ISSUE)`)}`);
        unknownDocs.push({ pod, docRef, index: i + 1 });
      } else if (detectedType === 'RAR') {
        console.log(`  Detected Type: ${success(`${detectedType}`)}`);
        rarDocs.push({ pod, docRef, index: i + 1 });
      } else {
        console.log(`  Detected Type: ${detectedType}`);
      }

      console.log(`  Confidence: ${confidence}%`);
    }

    // Check validation status
    if (delivery.deliveryValidation) {
      console.log(header('DELIVERY VALIDATION STATUS'));
      console.log(`Overall Status: ${delivery.deliveryValidation.status}`);
      console.log(`Summary: ${delivery.deliveryValidation.summary}`);

      if (delivery.deliveryValidation.documentCompleteness) {
        const dc = delivery.deliveryValidation.documentCompleteness;
        if (dc.missingDocuments && dc.missingDocuments.length > 0) {
          console.log(`\nMissing Documents: ${error(dc.missingDocuments.join(', '))}`);
        }
      }
    }

    // Phase C-F: Analyze UNKNOWN documents
    if (unknownDocs.length > 0) {
      for (const { pod, docRef, index } of unknownDocs) {
        console.log(header(`ANALYSIS: Document ${index} (${pod.fileMetadata.originalName})`));

        // Phase C: OCR Analysis
        console.log(subheader('OCR EXTRACTION'));

        const hasText = pod.extractedData?.rawText && pod.extractedData.rawText.length > 0;
        const textLength = pod.extractedData?.rawText?.length || 0;
        const ocrConfidence = pod.processingMetadata?.ocrConfidence || 0;

        if (hasText) {
          console.log(success(`Text Extracted: YES (${textLength.toLocaleString()} characters)`));
        } else {
          console.log(error('Text Extracted: NO - OCR failed or document is blank'));
        }

        if (ocrConfidence > 0) {
          if (ocrConfidence < 60) {
            console.log(warning(`OCR Confidence: ${ocrConfidence}% (LOW)`));
          } else {
            console.log(`OCR Confidence: ${ocrConfidence}%`);
          }
        }

        // Show text preview
        if (hasText && pod.extractedData.rawText) {
          const preview = pod.extractedData.rawText.substring(0, 200).replace(/\n/g, ' ');
          console.log(`\nText Preview:\n"${preview}${textLength > 200 ? '...' : ''}"  `);
        }

        // Phase D: Classification Analysis
        if (pod.documentClassification) {
          console.log(subheader('CLASSIFICATION RESULTS'));
          const classification = pod.documentClassification;

          console.log(`Detected Type: ${classification.detectedType}`);
          console.log(`Confidence: ${classification.confidence}% (threshold: ${MINIMUM_CONFIDENCE_THRESHOLD}%)`);

          if (classification.confidence < MINIMUM_CONFIDENCE_THRESHOLD) {
            console.log(error(`Confidence below threshold - marked as UNKNOWN`));
          }

          if (classification.keywords && classification.keywords.length > 0) {
            console.log(`\nMatched Keywords: ${classification.keywords.join(', ')}`);
          } else {
            console.log(warning('No keywords matched'));
          }

          if (classification.alternativeTypes && classification.alternativeTypes.length > 0) {
            console.log('\nAlternative Types Considered:');
            classification.alternativeTypes.forEach((alt) => {
              console.log(`  - ${alt.type}: ${alt.confidence}%`);
            });
          }
        }

        // Phase E: RAR Keyword Verification
        if (hasText && pod.extractedData.rawText) {
          console.log(subheader('RAR KEYWORD ANALYSIS'));

          const analysis = analyzeRARKeywords(pod.extractedData.rawText);

          console.log('\nPrimary Keywords (weight: 10 each):');
          RAR_KEYWORDS.primary.forEach((keyword) => {
            if (analysis.primaryMatches.includes(keyword)) {
              console.log(success(`"${keyword}" - FOUND`));
            } else {
              console.log(error(`"${keyword}" - NOT FOUND`));
            }
          });

          console.log('\nSecondary Keywords (weight: 2 each):');
          RAR_KEYWORDS.secondary.forEach((keyword) => {
            if (analysis.secondaryMatches.includes(keyword)) {
              console.log(success(`"${keyword}" - FOUND`));
            } else {
              console.log(error(`"${keyword}" - NOT FOUND`));
            }
          });

          console.log(`\n${colors.bold}Scoring Summary:${colors.reset}`);
          console.log(`  Primary Matches: ${analysis.primaryMatches.length}/${RAR_KEYWORDS.primary.length} (${analysis.primaryMatches.length * RAR_KEYWORDS.weight.primary} points)`);
          console.log(`  Secondary Matches: ${analysis.secondaryMatches.length}/${RAR_KEYWORDS.secondary.length} (${analysis.secondaryMatches.length * RAR_KEYWORDS.weight.secondary} points)`);
          console.log(`  Total Score: ${analysis.score} points`);
          console.log(`  Calculated Confidence: ${analysis.confidence}%`);

          if (analysis.confidence < MINIMUM_CONFIDENCE_THRESHOLD) {
            console.log(error(`Below ${MINIMUM_CONFIDENCE_THRESHOLD}% threshold - would be marked as UNKNOWN`));
          } else {
            console.log(success(`Above ${MINIMUM_CONFIDENCE_THRESHOLD}% threshold - would be detected as RAR`));
          }
        }

        // Phase F: Image Quality Check
        if (pod.validationResult?.checks?.imageQuality) {
          console.log(subheader('IMAGE QUALITY'));
          const quality = pod.validationResult.checks.imageQuality;

          if (quality.blurry) {
            console.log(warning(`Blurry: YES (score: ${quality.blurScore || 'N/A'})`));
          } else {
            console.log(success('Blurry: NO'));
          }

          if (quality.lowContrast) {
            console.log(warning('Low Contrast: YES'));
          } else {
            console.log(success('Low Contrast: NO'));
          }

          if (quality.incomplete) {
            console.log(warning('Incomplete: YES'));
          } else {
            console.log(success('Incomplete: NO'));
          }
        }

        // Phase G: Root Cause Diagnosis
        console.log(header('ROOT CAUSE DIAGNOSIS'));

        if (!hasText) {
          console.log(error('Issue: NO_TEXT_EXTRACTED'));
          console.log('\nThe document failed detection because:');
          console.log('- OCR did not extract any text from the document');
          console.log('- This could be due to:');
          console.log('  • Blank or empty document');
          console.log('  • Image quality too poor for OCR to process');
          console.log('  • Unsupported document format or encoding');
          console.log('  • OCR processing error');
        } else {
          const analysis = analyzeRARKeywords(pod.extractedData.rawText);

          if (analysis.primaryMatches.length === 0) {
            console.log(error('Issue: MISSING_RAR_PRIMARY_KEYWORDS'));
            console.log('\nThe document failed detection because:');
            console.log('- NO primary RAR keywords were found in the extracted text');
            console.log('- Primary keywords are essential for RAR detection');
            console.log(`- Only ${analysis.secondaryMatches.length} secondary keywords were found`);
            console.log(`- This resulted in low confidence (${analysis.confidence}%), below the ${MINIMUM_CONFIDENCE_THRESHOLD}% threshold`);
          } else if (analysis.confidence < MINIMUM_CONFIDENCE_THRESHOLD) {
            console.log(error('Issue: LOW_CONFIDENCE_SCORE'));
            console.log('\nThe document failed detection because:');
            console.log('- Some RAR keywords were found, but not enough for confident classification');
            console.log(`- Confidence score (${analysis.confidence}%) is below the ${MINIMUM_CONFIDENCE_THRESHOLD}% threshold`);
            console.log(`- Found ${analysis.primaryMatches.length} primary and ${analysis.secondaryMatches.length} secondary keywords`);
            console.log('- More keyword matches needed for successful detection');
          } else {
            console.log(warning('Issue: CLASSIFICATION_MISMATCH'));
            console.log('\nThe document has sufficient RAR keywords but was classified differently:');
            console.log('- This might be a classification algorithm issue');
            console.log('- Or another document type scored higher');
          }

          if (ocrConfidence > 0 && ocrConfidence < 60) {
            console.log(warning('\nContributing Factor: LOW_OCR_CONFIDENCE'));
            console.log(`- OCR confidence (${ocrConfidence}%) is below optimal levels`);
            console.log('- Poor OCR quality may have affected keyword detection');
          }
        }

        // Recommendations
        console.log(header('RECOMMENDATIONS'));

        if (!hasText) {
          console.log('1. CHECK DOCUMENT QUALITY:');
          console.log('   - Verify the uploaded file is not blank or corrupted');
          console.log('   - Ensure the document contains readable text');
          console.log('   - Try re-scanning with higher quality settings\n');

          console.log('2. VERIFY FILE FORMAT:');
          console.log('   - Ensure the file is a valid PDF or image format');
          console.log('   - Check if the PDF has a text layer (not just scanned image)\n');

          console.log('3. MANUAL CLASSIFICATION:');
          console.log('   - If this is definitely a RAR document, you can manually update the classification');
          console.log(`   - MongoDB command: db.pods.updateOne({_id: ObjectId("${pod._id}")}, {$set: {"documentClassification.detectedType": "RAR", "documentClassification.confidence": 100}})`);
        } else {
          const analysis = analyzeRARKeywords(pod.extractedData.rawText);

          if (analysis.primaryMatches.length === 0) {
            console.log('1. VERIFY DOCUMENT TYPE:');
            console.log('   - Review the document to confirm it is actually a RAR (Receiving and Acknowledgment Receipt)');
            console.log('   - RAR documents should contain terms like "RAR", "receiving and acknowledgment", or "R.A.R."');
            console.log('   - If this is not a RAR document, upload the correct document\n');

            console.log('2. UPDATE KEYWORD CONFIGURATION (if document is legitimate RAR):');
            console.log('   - The document may use different terminology');
            console.log('   - Add new keywords to backend/src/services/document-classification.service.ts');
            console.log('   - Reprocess the delivery after updating keywords\n');

            console.log('3. MANUAL CLASSIFICATION (temporary fix):');
            console.log('   - Update the classification in MongoDB:');
            console.log(`   - Command: db.pods.updateOne({_id: ObjectId("${pod._id}")}, {$set: {"documentClassification.detectedType": "RAR", "documentClassification.confidence": 100}})`);
            console.log('   - Then re-validate the delivery');
          } else {
            console.log('1. ADJUST CONFIDENCE THRESHOLD:');
            console.log(`   - Current threshold: ${MINIMUM_CONFIDENCE_THRESHOLD}%`);
            console.log(`   - Document confidence: ${analysis.confidence}%`);
            console.log('   - Consider lowering threshold if many legitimate documents fail\n');

            console.log('2. ENHANCE KEYWORD CONFIGURATION:');
            console.log('   - Add more specific RAR keywords to improve detection');
            console.log('   - Increase weights for critical keywords\n');

            console.log('3. MANUAL CLASSIFICATION:');
            console.log('   - Update classification and re-validate delivery');
          }
        }
      }
    } else if (rarDocs.length > 0) {
      console.log(header('RAR DETECTION SUCCESSFUL'));
      console.log(success(`Found ${rarDocs.length} RAR document(s)`));

      for (const { pod, docRef, index } of rarDocs) {
        console.log(`\nDocument ${index}: ${pod.fileMetadata.originalName}`);
        console.log(`  Confidence: ${docRef.classificationConfidence}%`);

        if (pod.extractedData?.rawText) {
          const analysis = analyzeRARKeywords(pod.extractedData.rawText);
          console.log(`  Primary Keywords Matched: ${analysis.primaryMatches.length}/${RAR_KEYWORDS.primary.length}`);
          console.log(`  Secondary Keywords Matched: ${analysis.secondaryMatches.length}/${RAR_KEYWORDS.secondary.length}`);
        }
      }

      console.log('\nIf validation still fails, check the validation logs for other issues (PO number mismatch, quantity discrepancies, etc.)');
    } else {
      console.log(header('NO RAR OR UNKNOWN DOCUMENTS'));
      console.log(warning('No RAR documents found and no classification issues detected'));
      console.log('\nPossible reasons for validation failure:');
      console.log('- RAR document was not uploaded at all');
      console.log('- Document was classified as a different type');
      console.log('- Check the Document Inventory section above');
    }

    console.log(header('DIAGNOSTIC COMPLETE'));
    console.log(`\nFor more details, check logs at: backend/logs/combined.log`);
    console.log(`MongoDB collection: pods (for document details)`);
    console.log(`MongoDB collection: deliveries (for delivery validation)\n`);

  } catch (error) {
    console.error(error('Error running diagnostic:'), error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Main execution
const deliveryRefOrId = process.argv[2];

if (!deliveryRefOrId) {
  console.log('Usage: npx ts-node backend/scripts/diagnose-delivery.ts <deliveryReference or deliveryId>');
  console.log('\nExample:');
  console.log('  npx ts-node backend/scripts/diagnose-delivery.ts DEL-1768032477231-5a7af62e');
  console.log('  npx ts-node backend/scripts/diagnose-delivery.ts 507f1f77bcf86cd799439011');
  process.exit(1);
}

diagnoseDelivery(deliveryRefOrId)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
