const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    const delivery = await mongoose.connection.collection('deliveries').findOne({
      deliveryReference: 'DEL-1768137659009-5be1fa98'
    });

    console.log('=== Current Database Validation Result ===\n');
    console.log('Delivery:', delivery.deliveryReference);
    console.log('Status:', delivery.status);
    console.log('Validation Status:', delivery.deliveryValidation?.status);
    console.log('Validation Message:', delivery.deliveryValidation?.message);

    const checklist = delivery.deliveryValidation?.checklist;

    if (checklist) {
      console.log('\n--- Checklist Lengths ---');
      console.log('Document Completeness:', checklist.documentCompleteness?.length || 0);
      console.log('Pallet Validation:', checklist.palletValidation?.length || 0);
      console.log('Ship Document Validation:', checklist.shipDocumentValidation?.length || 0);
      console.log('Invoice Validation:', checklist.invoiceValidation?.length || 0, '← PROBLEM');
      console.log('Cross Document Checks:', checklist.crossDocumentChecks?.length || 0);

      if (checklist.invoiceValidation && checklist.invoiceValidation.length > 0) {
        console.log('\n--- Invoice Validation Checks (from DB) ---');
        checklist.invoiceValidation.forEach((check, idx) => {
          console.log(`${idx + 1}. ${check.name}`);
          console.log(`   Status: ${check.status}`);
          console.log(`   Message: ${check.message}`);
        });
      } else {
        console.log('\n✗ Invoice Validation array is EMPTY in database');
      }

      // Check when validation was last updated
      if (delivery.updatedAt) {
        console.log('\n--- Timing ---');
        console.log('Delivery last updated:', delivery.updatedAt);
        console.log('Time ago:', Math.floor((Date.now() - new Date(delivery.updatedAt).getTime()) / 1000), 'seconds');
      }
    } else {
      console.log('\n✗ No checklist found in validation result!');
    }

    // Check document types in delivery.documents array
    console.log('\n--- Document Types in Delivery.documents ---');
    delivery.documents.forEach((doc, idx) => {
      console.log(`${idx + 1}. ${doc.detectedType}`);
    });

    const hasInvoice = delivery.documents.some(d => d.detectedType === 'INVOICE');
    const hasRAR = delivery.documents.some(d => d.detectedType === 'RAR');

    console.log('\n--- Document Availability ---');
    console.log('Has INVOICE in delivery.documents:', hasInvoice);
    console.log('Has RAR in delivery.documents:', hasRAR);
    console.log('Should have invoice validation:', hasInvoice && hasRAR);

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
