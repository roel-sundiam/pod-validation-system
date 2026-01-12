const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    const { initializeValidationRegistry, validationRegistry } = require('./dist/backend/src/services/validation-registry.service.js');
    const { PODModel } = require('./dist/backend/src/models/pod.model.js');
    const { DeliveryModel } = require('./dist/backend/src/models/delivery.model.js');

    await initializeValidationRegistry();

    const delivery = await DeliveryModel.findOne({
      deliveryReference: 'DEL-1768137659009-5be1fa98'
    });

    const podIds = delivery.documents.map(d => d.podId);
    const pods = await PODModel.find({ _id: { $in: podIds } });

    console.log('Running validation...\n');
    const validator = validationRegistry.getValidator('SUPER8');
    const result = await validator.validate(delivery, pods);

    console.log('=== Full Validation Result ===');
    console.log('Status:', result.status);
    console.log('Message:', result.message);
    console.log('Peculiarities:', result.peculiarities?.length || 0);

    console.log('\n=== Checklist Structure ===');
    console.log('Document Completeness checks:', result.checklist?.documentCompleteness?.length || 0);
    console.log('Pallet Validation checks:', result.checklist?.palletValidation?.length || 0);
    console.log('Ship Document Validation checks:', result.checklist?.shipDocumentValidation?.length || 0);
    console.log('Invoice Validation checks:', result.checklist?.invoiceValidation?.length || 0);
    console.log('Cross Document checks:', result.checklist?.crossDocumentChecks?.length || 0);

    if (result.checklist?.invoiceValidation) {
      console.log('\n=== Invoice Validation Details ===');
      result.checklist.invoiceValidation.forEach((check, idx) => {
        const icon = check.status === 'PASSED' ? '✓' : check.status === 'FAILED' ? '✗' : '⚠';
        console.log(`${idx + 1}. ${icon} ${check.name}`);
        console.log(`   Status: ${check.status}`);
        console.log(`   Message: ${check.message}`);
        if (check.details) {
          console.log(`   Details:`, JSON.stringify(check.details, null, 2));
        }
      });
    } else {
      console.log('\n✗ Invoice Validation section is missing or empty!');
    }

    // Save to database
    await DeliveryModel.updateOne(
      { _id: delivery._id },
      {
        $set: {
          deliveryValidation: result,
          status: 'COMPLETED'
        }
      }
    );

    console.log('\n✓ Validation saved to database');
    console.log('\n📝 Please refresh your frontend!');

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
