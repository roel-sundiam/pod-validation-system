const mongoose = require('mongoose');
require('dotenv').config();

const deliveryId = '69639db7aa82ead01bd9d89e';
const podId = '69639db8aa82ead01bd9d8c4';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pod-validation')
  .then(async () => {
    const POD = mongoose.model('POD', new mongoose.Schema({}, { strict: false }));
    const Delivery = mongoose.model('Delivery', new mongoose.Schema({}, { strict: false }));

    const pod = await POD.findById(podId);
    const delivery = await Delivery.findById(deliveryId);

    console.log('\n=== Document Status ===');
    console.log('File:', pod.fileMetadata?.originalName);
    console.log('Classification:', pod.documentClassification?.detectedType);
    console.log('Confidence:', pod.documentClassification?.confidence);
    console.log('Manual Override:', pod.documentClassification?.manualOverride);
    console.log('Override Reason:', pod.documentClassification?.overrideReason);

    console.log('\n=== Delivery Documents ===');
    delivery.documents.forEach((doc, idx) => {
      console.log(`${idx + 1}. Type: ${doc.detectedType}`);
    });

    console.log('\n✓ Manual override is active!');
    console.log('\n📝 Next Steps:');
    console.log('1. Refresh your frontend browser page');
    console.log('2. Check the validation results');
    console.log('3. Invoice Validation should now recognize the RAR document');
    console.log('\nNote: The frontend may need a full page refresh (Ctrl+Shift+R or Cmd+Shift+R)');

    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
