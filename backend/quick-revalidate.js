const mongoose = require('mongoose');
require('dotenv').config();

const deliveryId = '69639db7aa82ead01bd9d89e';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    console.log('Connected to MongoDB');
    console.log('Re-running validation manually...\n');

    // Import after DB connection
    const { validationRegistry, initializeValidationRegistry } = require('./dist/backend/src/services/validation-registry.service.js');
    const { DeliveryModel } = require('./dist/backend/src/models/delivery.model.js');
    const { PODModel } = require('./dist/backend/src/models/pod.model.js');

    // Initialize validators
    await initializeValidationRegistry();

    // Load delivery and PODs
    const delivery = await DeliveryModel.findById(deliveryId);
    if (!delivery) {
      console.error('Delivery not found');
      process.exit(1);
    }

    const podIds = delivery.documents.map(d => d.podId);
    const pods = await PODModel.find({ _id: { $in: podIds } });

    console.log('Delivery:', delivery.deliveryReference);
    console.log('Client:', delivery.clientIdentifier);
    console.log('Documents:', delivery.documents.length);
    console.log('\nDocument types:');
    delivery.documents.forEach((doc, idx) => {
      const pod = pods.find(p => p._id.toString() === doc.podId.toString());
      console.log(`  ${idx + 1}. ${doc.detectedType} - ${pod?.fileMetadata?.originalName || 'unknown'}`);
    });

    // Get validator and run validation
    const validator = validationRegistry.getValidator(delivery.clientIdentifier);
    console.log('\nRunning validation with:', validator.getName());

    const validationResult = await validator.validate(delivery, pods);

    // Update delivery
    delivery.deliveryValidation = validationResult;
    delivery.status = 'COMPLETED';
    await delivery.save();

    console.log('\n✓ Validation completed!');
    console.log('Status:', validationResult.status);
    console.log('Overall Message:', validationResult.message);

    // Show Invoice Validation section
    const invoiceSection = validationResult.checklist?.invoiceValidation;
    if (invoiceSection && invoiceSection.length > 0) {
      console.log('\n📋 Invoice Validation:');
      invoiceSection.forEach(check => {
        const icon = check.status === 'PASSED' ? '✓' : check.status === 'FAILED' ? '✗' : '⚠';
        console.log(`  ${icon} ${check.name}: ${check.message}`);
      });
    }

    console.log('\n✓ Please refresh the frontend to see updated results!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
