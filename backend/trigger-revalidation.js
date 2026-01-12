const mongoose = require('mongoose');
require('dotenv').config();

const deliveryId = '69639db7aa82ead01bd9d89e';

// Import the revalidation function
const path = require('path');
const revalidatePath = path.join(__dirname, 'dist/backend/src/services/delivery-validation.service.js');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    console.log('Connected to MongoDB');
    console.log('Triggering revalidation for delivery:', deliveryId);

    // Import after connection
    const { revalidateDelivery } = require(revalidatePath);

    try {
      await revalidateDelivery(deliveryId);
      console.log('\n✓ Revalidation completed successfully!');
      console.log('\nPlease refresh the frontend to see the updated validation results.');
      console.log('Invoice Validation should now show: ✓ PASSED');
    } catch (error) {
      console.error('Revalidation error:', error.message);
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
