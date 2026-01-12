const mongoose = require('mongoose');
require('dotenv').config();

const deliveryId = '6963a3ba1878415333a08635'; // Your delivery ID

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    console.log('Checking current database state...\n');

    // Check current document types
    const delivery = await mongoose.connection.collection('deliveries').findOne({
      deliveryReference: 'DEL-1768137659009-5be1fa98'
    });

    console.log('Delivery:', delivery.deliveryReference);
    console.log('\nCurrent document types in database:');
    delivery.documents.forEach((doc, idx) => {
      console.log(`  ${idx + 1}. ${doc.detectedType}`);
    });

    const hasRAR = delivery.documents.some(d => d.detectedType === 'RAR');
    console.log('\nHas RAR:', hasRAR ? '✓ YES' : '✗ NO');

    if (!hasRAR) {
      console.log('\n❌ ERROR: RAR documents not found in database!');
      console.log('Something went wrong with the reclassification.');
      process.exit(1);
    }

    console.log('\n✓ RAR documents ARE in the database!');
    console.log('Triggering revalidation...\n');

    // Initialize validator registry
    const { initializeValidationRegistry, validationRegistry } = require('./dist/backend/src/services/validation-registry.service.js');
    const { PODModel } = require('./dist/backend/src/models/pod.model.js');

    await initializeValidationRegistry();

    // Get all PODs
    const podIds = delivery.documents.map(d => d.podId);
    const pods = await PODModel.find({ _id: { $in: podIds } });

    console.log('Running Super8 validation...');
    const validator = validationRegistry.getValidator('SUPER8');
    const validationResult = await validator.validate(delivery, pods);

    // Update delivery with new validation result
    await mongoose.connection.collection('deliveries').updateOne(
      { _id: delivery._id },
      {
        $set: {
          deliveryValidation: validationResult,
          status: 'COMPLETED'
        }
      }
    );

    console.log('\n=== Validation Result ===');
    console.log('Status:', validationResult.status);
    console.log('Message:', validationResult.message);

    // Check invoice validation specifically
    const invoiceChecks = validationResult.checklist?.invoiceValidation || [];
    console.log('\n=== Invoice Validation Checks ===');
    invoiceChecks.forEach(check => {
      const icon = check.status === 'PASSED' ? '✓' : check.status === 'FAILED' ? '✗' : '⚠';
      console.log(`${icon} ${check.name}`);
      console.log(`  ${check.message}`);
    });

    console.log('\n✓ Validation complete and saved to database!');
    console.log('\n📝 Please refresh your frontend (Ctrl+Shift+R) to see the updated results!');

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
