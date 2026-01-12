import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pod_validation';

async function checkDelivery() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    
    const delivery = await db.collection('deliveries').findOne({ deliveryReference: /DEL-1768030111180/ });
    
    if (delivery) {
      console.log('\n=== Delivery Found ===');
      console.log('ID:', delivery._id);
      console.log('Reference:', delivery.deliveryReference);
      console.log('Status:', delivery.status);
      console.log('Client:', delivery.clientIdentifier);
      console.log('\n=== Delivery Validation ===');
      console.log(JSON.stringify(delivery.deliveryValidation, null, 2));
    } else {
      console.log('Delivery not found');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkDelivery();
