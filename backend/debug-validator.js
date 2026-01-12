const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    const delivery = await mongoose.connection.collection('deliveries').findOne({
      deliveryReference: 'DEL-1768137659009-5be1fa98'
    });

    console.log('=== Delivery Documents Array ===');
    delivery.documents.forEach((doc, idx) => {
      console.log(`${idx + 1}. POD ID: ${doc.podId.toString().substring(0, 8)}... Type: ${doc.detectedType}`);
    });

    // Get PODs from database
    const PODModel = mongoose.model('POD', new mongoose.Schema({}, { strict: false }));
    const podIds = delivery.documents.map(d => d.podId);
    const pods = await PODModel.find({ _id: { $in: podIds } });

    console.log('\n=== POD Classifications ===');
    pods.forEach((pod, idx) => {
      console.log(`${idx + 1}. ${pod.fileMetadata?.originalName}`);
      console.log(`   Classification: ${pod.documentClassification?.detectedType}`);
      console.log(`   Confidence: ${pod.documentClassification?.confidence}%`);
    });

    console.log('\n=== Checking for Invoice and RAR ===');
    const invoicePods = pods.filter(p => p.documentClassification?.detectedType === 'INVOICE');
    const rarPods = pods.filter(p => p.documentClassification?.detectedType === 'RAR');

    console.log(`Invoice PODs: ${invoicePods.length}`);
    invoicePods.forEach(p => console.log(`  - ${p.fileMetadata?.originalName}`));

    console.log(`RAR PODs: ${rarPods.length}`);
    rarPods.forEach(p => console.log(`  - ${p.fileMetadata?.originalName}`));

    if (invoicePods.length > 0 && rarPods.length > 0) {
      console.log('\n✓ Both Invoice and RAR are present in PODs!');
      console.log('The validator should be able to run invoice validation.');
    } else {
      console.log('\n✗ Missing documents:');
      if (invoicePods.length === 0) console.log('  - No INVOICE documents found');
      if (rarPods.length === 0) console.log('  - No RAR documents found');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
