require('dotenv').config();
const mongoose = require('mongoose');

async function cleanPODs() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pod_validation';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Get POD collection
    const db = mongoose.connection.db;
    const podCollection = db.collection('pods');
    const deliveryCollection = db.collection('deliveries');
    const auditLogCollection = db.collection('auditlogs');

    // Count documents before deletion
    const podCount = await podCollection.countDocuments();
    const deliveryCount = await deliveryCollection.countDocuments();
    const auditCount = await auditLogCollection.countDocuments();

    console.log('\nBefore cleaning:');
    console.log(`- PODs: ${podCount}`);
    console.log(`- Deliveries: ${deliveryCount}`);
    console.log(`- Audit Logs: ${auditCount}`);

    // Delete all documents
    console.log('\nCleaning collections...');
    const podResult = await podCollection.deleteMany({});
    const deliveryResult = await deliveryCollection.deleteMany({});
    const auditResult = await auditLogCollection.deleteMany({});

    console.log('\nDeleted:');
    console.log(`- PODs: ${podResult.deletedCount}`);
    console.log(`- Deliveries: ${deliveryResult.deletedCount}`);
    console.log(`- Audit Logs: ${auditResult.deletedCount}`);

    console.log('\n✅ Collections cleaned successfully!');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error cleaning collections:', error);
    process.exit(1);
  }
}

cleanPODs();
