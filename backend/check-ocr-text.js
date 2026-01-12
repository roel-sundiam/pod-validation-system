const mongoose = require('mongoose');
require('dotenv').config();

const podId = '6963a3bc1878415333a0865b';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    const POD = await mongoose.connection.collection('pods').findOne(
      { _id: new mongoose.Types.ObjectId(podId) }
    );

    console.log('=== OCR Extracted Text ===\n');
    const rawText = POD.extractedData?.rawText || '';
    console.log(rawText.substring(0, 1000)); // First 1000 characters

    console.log('\n\n=== Search for RAR Keywords ===');
    const keywords = ['RAR', 'R.A.R', 'receiving', 'acknowledgment', 'acknowledgement', 'received', 'delivery receipt'];

    keywords.forEach(keyword => {
      const found = rawText.toLowerCase().includes(keyword.toLowerCase());
      console.log(`${found ? '✓' : '✗'} "${keyword}": ${found ? 'FOUND' : 'NOT FOUND'}`);
    });

    console.log('\n=== Text Length ===');
    console.log('Total characters:', rawText.length);

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
