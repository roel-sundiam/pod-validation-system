const mongoose = require('mongoose');
require('dotenv').config();

const podId = '6963a3bc1878415333a0865b'; // New POD ID from re-upload

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    console.log('Getting delivery ID from POD...\n');

    // Get delivery ID from POD
    const pod = await mongoose.connection.collection('pods').findOne(
      { _id: new mongoose.Types.ObjectId(podId) }
    );

    if (!pod) {
      console.error('POD not found');
      process.exit(1);
    }

    const deliveryId = pod.deliveryId.toString();

    console.log('POD:', pod.fileMetadata?.originalName);
    console.log('Current Type:', pod.documentClassification?.detectedType);
    console.log('OCR Confidence:', pod.processingMetadata?.ocrConfidence);
    console.log('Delivery ID:', deliveryId);

    console.log('\nApplying manual override...');

    // Apply manual override
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

    console.log('✓ POD updated:', result.modifiedCount, 'modified');

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

    console.log('✓ Delivery updated:', deliveryResult.modifiedCount, 'modified');

    // Get delivery reference
    const delivery = await mongoose.connection.collection('deliveries').findOne(
      { _id: new mongoose.Types.ObjectId(deliveryId) }
    );

    console.log('\n✅ Manual override applied successfully!');
    console.log('Delivery:', delivery.deliveryReference);
    console.log('\n📝 Please REFRESH your frontend to see updated validation results.');

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
