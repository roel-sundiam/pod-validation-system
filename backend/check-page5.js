const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    // Get Page 5 POD
    const pod = await mongoose.connection.collection('pods').findOne({
      'fileMetadata.originalName': '4518688183 FULL_Page_05.jpg'
    });

    if (!pod) {
      console.log('Page 5 not found');
      process.exit(1);
    }

    const rawText = pod.extractedData?.rawText || '';

    console.log('=== Page 5 OCR Text (First 1500 chars) ===\n');
    console.log(rawText.substring(0, 1500));

    console.log('\n\n=== RAR Keywords Search ===');
    const keywords = ['RAR', 'R.A.R', 'receiving', 'acknowledgment', 'acknowledgement', 'received'];

    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = rawText.match(regex);
      if (matches) {
        console.log(`✓ "${keyword}": Found ${matches.length} time(s)`);

        // Show context around the match
        const index = rawText.toLowerCase().indexOf(keyword.toLowerCase());
        if (index !== -1) {
          const start = Math.max(0, index - 40);
          const end = Math.min(rawText.length, index + keyword.length + 40);
          console.log(`  Context: ...${rawText.substring(start, end)}...`);
        }
      } else {
        console.log(`✗ "${keyword}": NOT FOUND`);
      }
    });

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
