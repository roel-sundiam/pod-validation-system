/**
 * Clean Database Script
 *
 * This script drops all collections in the database to start fresh.
 * USE WITH CAUTION - This will delete all data!
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const cleanDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pod_validation';

    console.log('Connecting to MongoDB...');
    console.log('Database:', mongoUri.includes('@') ? mongoUri.split('@')[1].split('/')[1].split('?')[0] : 'pod_validation');

    await mongoose.connect(mongoUri);

    console.log('✓ Connected successfully');
    console.log('Database name:', mongoose.connection.name);

    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray();

    console.log(`\nFound ${collections.length} collections:`);
    collections.forEach(col => console.log(`  - ${col.name}`));

    if (collections.length === 0) {
      console.log('\n✓ Database is already empty');
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log('\nDropping all collections...');

    // Drop each collection
    for (const collection of collections) {
      await mongoose.connection.db.dropCollection(collection.name);
      console.log(`  ✓ Dropped: ${collection.name}`);
    }

    console.log('\n✓ Database cleaned successfully!');

    await mongoose.connection.close();
    console.log('✓ Disconnected from MongoDB');

    process.exit(0);

  } catch (error) {
    console.error('✗ Error cleaning database:', error.message);

    if (error.name === 'MongoServerError' && error.code === 13) {
      console.error('\nAuthentication failed. Please check your MONGODB_URI credentials in .env file.');
    } else if (error.name === 'MongooseServerSelectionError') {
      console.error('\nCould not connect to MongoDB. Please check:');
      console.error('  1. MongoDB is running');
      console.error('  2. MONGODB_URI in .env is correct');
      console.error('  3. Network connection is available');
    }

    process.exit(1);
  }
};

// Run the script
cleanDatabase();
