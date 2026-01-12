const mongoose = require('mongoose');
require('dotenv').config();

const deliveryId = '69639db7aa82ead01bd9d89e';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    const delivery = await mongoose.connection.collection('deliveries').findOne(
      { _id: new mongoose.Types.ObjectId(deliveryId) }
    );

    console.log('\n=== Current Validation Status ===');
    console.log('Delivery:', delivery.deliveryReference);
    console.log('Status:', delivery.status);
    console.log('Validation Status:', delivery.deliveryValidation?.status);
    console.log('Validation Message:', delivery.deliveryValidation?.message);

    console.log('\n=== Documents ===');
    delivery.documents.forEach((doc, idx) => {
      console.log(`${idx + 1}. ${doc.detectedType}`);
    });

    // Check if RAR is present
    const hasRAR = delivery.documents.some(d => d.detectedType === 'RAR');
    const hasInvoice = delivery.documents.some(d => d.detectedType === 'INVOICE');

    console.log('\n=== Document Check ===');
    console.log('Has Invoice:', hasInvoice ? '✓' : '✗');
    console.log('Has RAR:', hasRAR ? '✓' : '✗');

    if (hasRAR && hasInvoice) {
      console.log('\n✓ Both Invoice and RAR are present!');
      console.log('\n📝 The validation should now pass.');
      console.log('   Please REFRESH your frontend to see the updated results.');
      console.log('\n   If it still shows the old error:');
      console.log('   1. Do a hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)');
      console.log('   2. Or clear browser cache');
      console.log('   3. Or navigate away and back to the delivery');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
