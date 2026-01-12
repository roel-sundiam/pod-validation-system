const mongoose = require('mongoose');
require('dotenv').config();

const deliveryId = '6963a3bc1878415333a0865a'; // Get from POD

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    // Get delivery ID from the POD
    const pod = await mongoose.connection.collection('pods').findOne({
      _id: new mongoose.Types.ObjectId('6963a3bc1878415333a0865b')
    });

    const actualDeliveryId = pod.deliveryId.toString();

    const delivery = await mongoose.connection.collection('deliveries').findOne({
      _id: new mongoose.Types.ObjectId(actualDeliveryId)
    });

    console.log('=== All Documents in Delivery ===');
    console.log('Delivery:', delivery.deliveryReference);
    console.log('Total documents:', delivery.documents.length);
    console.log('\n');

    // Get all PODs
    const podIds = delivery.documents.map(d => d.podId);
    const pods = await mongoose.connection.collection('pods').find({
      _id: { $in: podIds.map(id => new mongoose.Types.ObjectId(id.toString())) }
    }).toArray();

    // Check each document
    for (let i = 0; i < delivery.documents.length; i++) {
      const doc = delivery.documents[i];
      const pod = pods.find(p => p._id.toString() === doc.podId.toString());

      console.log(`${i + 1}. ${pod.fileMetadata?.originalName}`);
      console.log(`   Type: ${doc.detectedType}`);
      console.log(`   OCR Confidence: ${pod.processingMetadata?.ocrConfidence}%`);

      // Search for RAR keywords in this document
      const rawText = pod.extractedData?.rawText || '';
      const hasRAR = rawText.toLowerCase().includes('rar') ||
                     rawText.toLowerCase().includes('receiving and acknowledgment') ||
                     rawText.toLowerCase().includes('acknowledgement receipt');

      if (hasRAR) {
        console.log(`   ⭐ CONTAINS RAR KEYWORDS!`);
      }

      // Search for common document indicators
      const hasInvoice = rawText.toLowerCase().includes('invoice');
      const hasShip = rawText.toLowerCase().includes('shipment') || rawText.toLowerCase().includes('dispatch');

      if (hasInvoice) console.log(`   📄 Contains "invoice"`);
      if (hasShip) console.log(`   📦 Contains shipping keywords`);

      console.log('');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
