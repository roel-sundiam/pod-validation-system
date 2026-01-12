/**
 * Check Database Contents
 *
 * This script shows what's in the database without modifying anything
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const checkDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pod_validation';

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);

    console.log('✓ Connected successfully');
    console.log('Database name:', mongoose.connection.name);
    console.log('');

    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();

    console.log(`Found ${collections.length} collection(s):\n`);

    if (collections.length === 0) {
      console.log('Database is empty - no collections found');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Check each collection
    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments();
      console.log(`📦 Collection: ${collection.name}`);
      console.log(`   Documents: ${count}`);

      if (count > 0) {
        // Get a sample document
        const sample = await mongoose.connection.db.collection(collection.name).findOne({});

        if (sample) {
          console.log('   Sample fields:', Object.keys(sample).join(', '));

          // Show specific info based on collection
          if (collection.name === 'pods') {
            console.log('   Latest document:', sample.fileMetadata?.originalName || 'Unknown');
            console.log('   Status:', sample.status || 'Unknown');
            console.log('   Validation:', sample.validationResult?.status || 'Unknown');
            console.log('   Client:', sample.clientIdentifier || 'None');
            console.log('   Created:', sample.createdAt ? new Date(sample.createdAt).toLocaleString() : 'Unknown');
          } else if (collection.name === 'deliveries') {
            console.log('   Delivery reference:', sample.deliveryReference || 'Unknown');
            console.log('   Status:', sample.status || 'Unknown');
            console.log('   Documents:', sample.documents?.length || 0);
            console.log('   Client:', sample.clientIdentifier || 'None');
          } else if (collection.name === 'auditlogs') {
            console.log('   Event type:', sample.eventType || 'Unknown');
            console.log('   Timestamp:', sample.timestamp ? new Date(sample.timestamp).toLocaleString() : 'Unknown');
          }
        }
      }
      console.log('');
    }

    await mongoose.connection.close();
    console.log('✓ Disconnected from MongoDB');

    process.exit(0);

  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
};

// Run the script
checkDatabase();
