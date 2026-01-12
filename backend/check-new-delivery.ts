import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/pod_validation';

async function checkDelivery() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    if (!db) {
      console.error('Database connection not available');
      process.exit(1);
    }

    const delivery = await db.collection('deliveries').findOne({ deliveryReference: 'DEL-1768032477231-5a7af62e' });
    
    if (delivery) {
      console.log('\n=== Delivery Found ===');
      console.log('ID:', delivery._id);
      console.log('Status:', delivery.status);
      console.log('\n=== Has Checklist? ===');
      console.log('Checklist exists:', !!delivery.deliveryValidation?.checklist);
      
      if (delivery.deliveryValidation?.checklist) {
        console.log('\n=== Checklist Data ===');
        console.log('Overall Status:', delivery.deliveryValidation.checklist.overallStatus);
        console.log('Summary:', delivery.deliveryValidation.checklist.summary);
        console.log('Document Completeness checks:', delivery.deliveryValidation.checklist.documentCompleteness.length);
        console.log('Document Specific checks:', delivery.deliveryValidation.checklist.documentSpecificChecks.length);
        console.log('Cross Document checks:', delivery.deliveryValidation.checklist.crossDocumentChecks.length);
      } else {
        console.log('No checklist found in deliveryValidation');
        console.log('\nDelivery Validation:');
        console.log(JSON.stringify(delivery.deliveryValidation, null, 2));
      }
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
