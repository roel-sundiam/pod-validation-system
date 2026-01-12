const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    console.log('Testing RAR prioritization with Page 5...\n');

    // Get Page 5 POD
    const pod = await mongoose.connection.collection('pods').findOne({
      'fileMetadata.originalName': '4518688183 FULL_Page_05.jpg'
    });

    if (!pod) {
      console.log('Page 5 not found');
      process.exit(1);
    }

    const podId = pod._id.toString();
    const deliveryId = pod.deliveryId.toString();

    console.log('=== Before ===');
    console.log('File:', pod.fileMetadata?.originalName);
    console.log('Current Classification:', pod.documentClassification?.detectedType);
    console.log('OCR Confidence:', pod.processingMetadata?.ocrConfidence + '%');

    // Import classification service
    const { classifyDocument } = require('./dist/backend/src/services/document-classification.service.js');

    // Reclassify
    console.log('\n=== Reclassifying with RAR prioritization... ===');
    const newClassification = await classifyDocument(podId);

    console.log('\n=== After ===');
    console.log('New Classification:', newClassification.detectedType);
    console.log('Confidence:', newClassification.confidence.toFixed(2) + '%');
    console.log('Keywords:', newClassification.keywords.slice(0, 5).join(', '));

    if (newClassification.detectedType === 'RAR') {
      console.log('\n🎉 SUCCESS! Document now classified as RAR!');
      console.log('\nUpdating database...');

      // Update POD
      await mongoose.connection.collection('pods').updateOne(
        { _id: new mongoose.Types.ObjectId(podId) },
        { $set: { 'documentClassification': newClassification } }
      );

      // Update delivery
      await mongoose.connection.collection('deliveries').updateOne(
        {
          _id: new mongoose.Types.ObjectId(deliveryId),
          'documents.podId': new mongoose.Types.ObjectId(podId)
        },
        { $set: { 'documents.$.detectedType': 'RAR' } }
      );

      console.log('✓ Database updated');

      // Get delivery reference
      const delivery = await mongoose.connection.collection('deliveries').findOne({
        _id: new mongoose.Types.ObjectId(deliveryId)
      });

      console.log('\n📝 Delivery:', delivery.deliveryReference);
      console.log('✓ Page 5 is now recognized as RAR');
      console.log('\nPlease REFRESH your frontend to see updated validation!');
    } else {
      console.log('\n⚠️ Still classified as:', newClassification.detectedType);
      console.log('Alternative types:', JSON.stringify(newClassification.alternativeTypes, null, 2));
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
