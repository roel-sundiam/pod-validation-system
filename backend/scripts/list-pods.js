/**
 * List all PODs in the database
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const listPODs = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pod_validation';

    console.log('Connecting to MongoDB...\n');
    await mongoose.connect(mongoUri);

    // Get all PODs
    const pods = await mongoose.connection.db.collection('pods')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`Found ${pods.length} POD document(s):\n`);
    console.log('='.repeat(100));

    pods.forEach((pod, index) => {
      console.log(`\n${index + 1}. POD ID: ${pod._id}`);
      console.log(`   File: ${pod.fileMetadata?.originalName || 'Unknown'}`);
      console.log(`   Size: ${pod.fileMetadata?.size ? Math.round(pod.fileMetadata.size / 1024) + ' KB' : 'Unknown'}`);
      console.log(`   Type: ${pod.fileMetadata?.mimeType || 'Unknown'}`);
      console.log(`   Client: ${pod.clientIdentifier || 'None'}`);
      console.log(`   Status: ${pod.status || 'Unknown'}`);
      console.log(`   Validation: ${pod.validationResult?.status || 'Unknown'}`);
      console.log(`   Peculiarities: ${pod.validationResult?.peculiarities?.length || 0}`);

      if (pod.validationResult?.peculiarities?.length > 0) {
        console.log(`   Issues:`);
        pod.validationResult.peculiarities.slice(0, 3).forEach(p => {
          console.log(`      - ${p.type}: ${p.description?.substring(0, 60)}...`);
        });
      }

      console.log(`   Uploaded: ${pod.createdAt ? new Date(pod.createdAt).toLocaleString() : 'Unknown'}`);
      console.log(`   Processing Time: ${pod.processingMetadata?.processingTimeMs ? pod.processingMetadata.processingTimeMs + ' ms' : 'Unknown'}`);
    });

    console.log('\n' + '='.repeat(100));
    console.log('\nSummary:');

    const statusCounts = pods.reduce((acc, pod) => {
      const status = pod.validationResult?.status || 'UNKNOWN';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    const clientCounts = pods.reduce((acc, pod) => {
      const client = pod.clientIdentifier || 'NO_CLIENT';
      acc[client] = (acc[client] || 0) + 1;
      return acc;
    }, {});

    console.log('\nClients:');
    Object.entries(clientCounts).forEach(([client, count]) => {
      console.log(`  ${client}: ${count}`);
    });

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
};

// Run the script
listPODs();
