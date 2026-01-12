const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    const { PODModel } = require('./dist/backend/src/models/pod.model.js');
    const { DeliveryModel } = require('./dist/backend/src/models/delivery.model.js');

    const delivery = await DeliveryModel.findOne({
      deliveryReference: 'DEL-1768137659009-5be1fa98'
    });

    const podIds = delivery.documents.map(d => d.podId);
    const pods = await PODModel.find({ _id: { $in: podIds } });

    console.log('=== Tracing Validator Logic ===\n');
    console.log('Total PODs fetched:', pods.length);

    // Replicate validator logic
    const invoicePod = pods.find(
      (p) => p.documentClassification?.detectedType === "INVOICE"
    );
    const rarPod = pods.find(
      (p) => p.documentClassification?.detectedType === "RAR"
    );

    console.log('\n--- Invoice POD Search ---');
    if (invoicePod) {
      console.log('✓ invoicePod FOUND');
      console.log('  POD ID:', invoicePod._id.toString());
      console.log('  File:', invoicePod.fileMetadata?.originalName);
      console.log('  Type:', invoicePod.documentClassification?.detectedType);
      console.log('  Confidence:', invoicePod.documentClassification?.confidence);
    } else {
      console.log('✗ invoicePod is NULL/UNDEFINED');
    }

    console.log('\n--- RAR POD Search ---');
    if (rarPod) {
      console.log('✓ rarPod FOUND');
      console.log('  POD ID:', rarPod._id.toString());
      console.log('  File:', rarPod.fileMetadata?.originalName);
      console.log('  Type:', rarPod.documentClassification?.detectedType);
      console.log('  Confidence:', rarPod.documentClassification?.confidence);
    } else {
      console.log('✗ rarPod is NULL/UNDEFINED');
    }

    console.log('\n--- Validation Condition Check ---');
    console.log('if (invoicePod && rarPod) =', !!(invoicePod && rarPod));

    if (invoicePod && rarPod) {
      console.log('✓ SHOULD generate invoice validation checks');
    } else {
      console.log('✗ WILL NOT generate invoice validation checks');
      console.log('  Missing:', !invoicePod ? 'invoicePod' : 'rarPod');
    }

    // Check all POD types
    console.log('\n--- All POD Classifications ---');
    pods.forEach((pod, idx) => {
      console.log(`${idx + 1}. ${pod.fileMetadata?.originalName}`);
      console.log(`   Type: ${pod.documentClassification?.detectedType || 'UNKNOWN'}`);
      console.log(`   Has classification object: ${!!pod.documentClassification}`);
      console.log(`   Classification keys:`, pod.documentClassification ? Object.keys(pod.documentClassification) : 'N/A');
    });

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
