const mongoose = require('mongoose');
require('dotenv').config();

const deliveryId = '69639db7aa82ead01bd9d89e';
const podId = '69639db8aa82ead01bd9d8c4';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    console.log('Applying manual override...\n');

    // Use direct update to ensure it persists
    const result = await mongoose.connection.collection('pods').updateOne(
      { _id: new mongoose.Types.ObjectId(podId) },
      {
        $set: {
          'documentClassification.detectedType': 'RAR',
          'documentClassification.confidence': 100,
          'documentClassification.manualOverride': true,
          'documentClassification.overrideReason': 'Manual verification - document contains RAR content but OCR confidence (50%) was below classification threshold',
          'documentClassification.overrideTimestamp': new Date(),
          'documentClassification.overrideBy': 'admin',
          'documentClassification.inferredFromContext': false
        }
      }
    );

    console.log('✓ POD updated:', result.matchedCount, 'matched,', result.modifiedCount, 'modified');

    // Update delivery documents array
    const deliveryResult = await mongoose.connection.collection('deliveries').updateOne(
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

    console.log('✓ Delivery updated:', deliveryResult.matchedCount, 'matched,', deliveryResult.modifiedCount, 'modified');

    // Verify the update
    const pod = await mongoose.connection.collection('pods').findOne(
      { _id: new mongoose.Types.ObjectId(podId) }
    );

    console.log('\n=== Verification ===');
    console.log('File:', pod.fileMetadata?.originalName);
    console.log('Type:', pod.documentClassification?.detectedType);
    console.log('Confidence:', pod.documentClassification?.confidence);
    console.log('Manual Override:', pod.documentClassification?.manualOverride);
    console.log('Override Reason:', pod.documentClassification?.overrideReason);

    console.log('\n✓ Manual override successfully applied!');
    console.log('\n📝 Next: Please REFRESH your frontend to see the updated validation.');

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
