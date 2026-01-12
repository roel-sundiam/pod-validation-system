const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    const delivery = await mongoose.connection.collection('deliveries').findOne({
      deliveryReference: 'DEL-1768137659009-5be1fa98'
    });

    console.log('=== Current Validation Status ===\n');
    console.log('Delivery:', delivery.deliveryReference);
    console.log('Status:', delivery.status);
    console.log('Validation Status:', delivery.deliveryValidation?.status);

    console.log('\n=== Document Types ===');
    delivery.documents.forEach((doc, idx) => {
      console.log(`${idx + 1}. ${doc.detectedType}`);
    });

    console.log('\n=== Validation Checklist ===');
    const checklist = delivery.deliveryValidation?.checklist;

    if (checklist) {
      console.log('\nDocument Completeness:');
      checklist.documentCompleteness?.forEach(check => {
        const icon = check.status === 'PASSED' ? '✓' : check.status === 'FAILED' ? '✗' : '⚠';
        console.log(`${icon} ${check.name}: ${check.message}`);
      });

      console.log('\nInvoice Validation:');
      checklist.invoiceValidation?.forEach(check => {
        const icon = check.status === 'PASSED' ? '✓' : check.status === 'FAILED' ? '✗' : '⚠';
        console.log(`${icon} ${check.name}`);
        console.log(`  Message: ${check.message}`);
        if (check.details) {
          console.log(`  Details:`, JSON.stringify(check.details, null, 2));
        }
      });

      console.log('\nCross-Document Checks:');
      checklist.crossDocumentChecks?.forEach(check => {
        const icon = check.status === 'PASSED' ? '✓' : check.status === 'FAILED' ? '✗' : '⚠';
        console.log(`${icon} ${check.name}: ${check.message}`);
      });
    } else {
      console.log('No checklist found!');
    }

    console.log('\n📝 Refresh your frontend to see these results!');

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
