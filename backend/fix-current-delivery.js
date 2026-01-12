const mongoose = require('mongoose');
require('dotenv').config();

// User's current delivery POD ID
const unknownPodId = '6963a3bc1878415333a0865b';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    console.log('Fixing user\'s current delivery...\n');

    // Get the delivery ID
    const unknownPod = await mongoose.connection.collection('pods').findOne({
      _id: new mongoose.Types.ObjectId(unknownPodId)
    });

    const deliveryId = unknownPod.deliveryId.toString();

    // Get all PODs in this delivery
    const delivery = await mongoose.connection.collection('deliveries').findOne({
      _id: new mongoose.Types.ObjectId(deliveryId)
    });

    console.log('Delivery:', delivery.deliveryReference);
    console.log('Total documents:', delivery.documents.length);
    console.log('\nReclassifying all documents with Phase 2 improvements...\n');

    // Reclassify all documents
    const { classifyDocument } = require('./dist/backend/src/services/document-classification.service.js');

    let rarFound = false;
    let rarPodId = null;

    for (const doc of delivery.documents) {
      const podId = doc.podId.toString();
      const pod = await mongoose.connection.collection('pods').findOne({
        _id: new mongoose.Types.ObjectId(podId)
      });

      console.log(`Processing: ${pod.fileMetadata?.originalName}`);
      console.log(`  Current: ${doc.detectedType}`);

      const newClassification = await classifyDocument(podId);

      if (newClassification.detectedType !== doc.detectedType) {
        console.log(`  ✓ Reclassified to: ${newClassification.detectedType} (${newClassification.confidence.toFixed(1)}%)`);

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
          { $set: { 'documents.$.detectedType': newClassification.detectedType } }
        );

        if (newClassification.detectedType === 'RAR') {
          rarFound = true;
          rarPodId = podId;
        }
      } else {
        console.log(`  - No change`);
      }
    }

    console.log('\n' + '='.repeat(50));
    if (rarFound) {
      console.log('✅ SUCCESS! RAR document found and classified!');
      console.log(`RAR POD ID: ${rarPodId}`);
    } else {
      console.log('⚠️ No RAR document found in this delivery');
      console.log('   All documents may be Invoices only.');
    }

    console.log('\n📝 Delivery:', delivery.deliveryReference);
    console.log('✓ All documents reclassified with Phase 2 improvements');
    console.log('\nPlease REFRESH your frontend to see updated validation!');

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
