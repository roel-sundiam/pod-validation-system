const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    // Get Page 5 POD
    const pod = await mongoose.connection.collection('pods').findOne({
      'fileMetadata.originalName': '4518688183 FULL_Page_05.jpg'
    });

    const rawText = pod.extractedData?.rawText || '';
    const lowerText = rawText.toLowerCase();

    console.log('=== Testing RAR Keywords ===\n');

    const rarKeywords = [
      'RAR', 'R.A.R', 'receiving acknowledgment', 'receiving acknowledgement',
      'acknowledgment receipt', 'acknowledgement receipt',
      'CFAST', 'received', 'receiver signature'
    ];

    rarKeywords.forEach(keyword => {
      const found = lowerText.includes(keyword.toLowerCase());
      console.log(`${found ? '✓' : '✗'} "${keyword}": ${found ? 'FOUND' : 'NOT FOUND'}`);
    });

    console.log('\n=== Checking Exact Phrases ===');
    const phrases = [
      'receiving acknowledgement receipt',
      'CFAST receiving',
      'received qty',
      'received | received qty'
    ];

    phrases.forEach(phrase => {
      const found = lowerText.includes(phrase.toLowerCase());
      console.log(`${found ? '✓' : '✗'} "${phrase}": ${found ? 'FOUND' : 'NOT FOUND'}`);
    });

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
