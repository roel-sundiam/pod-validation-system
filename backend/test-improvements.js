const mongoose = require('mongoose');
require('dotenv').config();

const podId = '6963a3bc1878415333a0865b'; // Your current UNKNOWN document

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    console.log('Testing Phase 2 improvements...\n');

    // Import the classification service
    const { classifyDocument } = require('./dist/backend/src/services/document-classification.service.js');

    // Get current classification
    const POD = await mongoose.connection.collection('pods').findOne(
      { _id: new mongoose.Types.ObjectId(podId) }
    );

    console.log('=== Before Phase 2 ===');
    console.log('File:', POD.fileMetadata?.originalName);
    console.log('Current Classification:', POD.documentClassification?.detectedType);
    console.log('OCR Confidence:', POD.processingMetadata?.ocrConfidence);
    console.log('Keywords Found:', POD.documentClassification?.keywords.join(', '));

    // Run reclassification with new improvements
    console.log('\n=== Running Reclassification with Phase 2 Improvements ===');
    console.log('Improvements active:');
    console.log('  ✓ Dynamic threshold (25% → 15% for OCR <60%)');
    console.log('  ✓ Enhanced RAR keywords (15+ variations)');
    console.log('  ✓ Fuzzy matching (handles OCR errors)');

    const newClassification = await classifyDocument(podId);

    console.log('\n=== After Phase 2 ===');
    console.log('New Classification:', newClassification.detectedType);
    console.log('Confidence:', newClassification.confidence.toFixed(2) + '%');
    console.log('Keywords Matched:', newClassification.keywords.join(', '));

    if (newClassification.detectedType === 'RAR') {
      console.log('\n🎉 SUCCESS! Document now classified as RAR!');
      console.log('\nUpdating database...');

      // Update POD in database
      await mongoose.connection.collection('pods').updateOne(
        { _id: new mongoose.Types.ObjectId(podId) },
        {
          $set: {
            'documentClassification': newClassification
          }
        }
      );

      // Update delivery
      const deliveryId = POD.deliveryId.toString();
      await mongoose.connection.collection('deliveries').updateOne(
        {
          _id: new mongoose.Types.ObjectId(deliveryId),
          'documents.podId': new mongoose.Types.ObjectId(podId)
        },
        {
          $set: {
            'documents.$.detectedType': 'RAR'
          }
        }
      );

      console.log('✓ Database updated');
      console.log('\n📝 Please REFRESH your frontend to see the updated validation!');
    } else {
      console.log('\n⚠️  Still classified as:', newClassification.detectedType);
      console.log('Alternative types:', newClassification.alternativeTypes);
      console.log('\nNeed to implement additional improvements...');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
