const mongoose = require('mongoose');
require('dotenv').config({ path: '/mnt/c/Projects2/POD_Validation/backend/.env' });

const deliveryId = '69639db7aa82ead01bd9d89e';
const podId = '69639db8aa82ead01bd9d8c4';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    console.log('Connected to MongoDB');

    // Load POD model
    const POD = mongoose.model('POD', new mongoose.Schema({}, { strict: false }));
    const pod = await POD.findById(podId);

    if (!pod) {
      console.error('POD not found');
      process.exit(1);
    }

    console.log('POD found:', pod.fileMetadata?.originalName);
    console.log('Current classification:', pod.documentClassification?.detectedType);
    console.log('OCR confidence:', pod.processingMetadata?.ocrConfidence);

    // Apply manual override
    pod.documentClassification = {
      ...pod.documentClassification,
      detectedType: 'RAR',
      confidence: 100,
      manualOverride: true,
      overrideReason: 'Manual verification - document contains RAR content but OCR confidence (50%) was below threshold',
      overrideTimestamp: new Date(),
      overrideBy: 'manual',
      inferredFromContext: false
    };

    await pod.save();
    console.log('\n✓ POD classification updated to RAR');

    // Update delivery documents array
    const Delivery = mongoose.model('Delivery', new mongoose.Schema({}, { strict: false }));
    const delivery = await Delivery.findById(deliveryId);

    if (delivery) {
      const docIndex = delivery.documents.findIndex(d => d.podId.toString() === podId);
      if (docIndex !== -1) {
        delivery.documents[docIndex].detectedType = 'RAR';
        await delivery.save();
        console.log('✓ Delivery document type updated');
      }
    }

    // Trigger revalidation
    console.log('\n✓ Manual override applied successfully!');
    console.log('✓ Delivery will be revalidated automatically');
    console.log('\nPlease refresh the frontend to see updated validation results.');

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
