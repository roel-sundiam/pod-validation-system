const mongoose = require("mongoose");
require("dotenv").config();

const DELIVERY_REF = "DEL-1768137659009-5be1fa98";

mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/pod-validation"
  )
  .then(async () => {
    console.log("🔍 Checking Ship Document Stamp Detection\n");

    const delivery = await mongoose.connection
      .collection("deliveries")
      .findOne({
        deliveryReference: DELIVERY_REF,
      });

    if (!delivery) {
      console.log("❌ Delivery not found!");
      process.exit(1);
    }

    // Find the ship document
    const shipDoc = delivery.documents.find(
      (d) => d.detectedType === "SHIP_DOCUMENT"
    );

    if (!shipDoc) {
      console.log("❌ No SHIP_DOCUMENT found in delivery!");
      console.log("\nAvailable document types:");
      delivery.documents.forEach((doc, idx) => {
        console.log(`  ${idx + 1}. ${doc.detectedType}`);
      });
      process.exit(1);
    }

    console.log("📄 Found Ship Document");
    console.log("POD ID:", shipDoc.podId.toString());
    console.log();

    // Get the POD document
    const pod = await mongoose.connection.collection("pods").findOne({
      _id: shipDoc.podId,
    });

    if (!pod) {
      console.log("❌ POD document not found!");
      process.exit(1);
    }

    console.log("=".repeat(80));
    console.log("📋 POD DOCUMENT DETAILS");
    console.log("=".repeat(80));
    console.log("File:", pod.fileMetadata?.originalName || "Unknown");
    console.log(
      "OCR Confidence:",
      (pod.processingMetadata?.ocrConfidence || 0) + "%"
    );
    console.log();

    // Check stamp detection
    console.log("=".repeat(80));
    console.log("🏷️  STAMP DETECTION RESULTS");
    console.log("=".repeat(80));

    if (!pod.stampDetection) {
      console.log("❌ No stampDetection data found!");
      console.log("   This means stamp detection was not run or failed.");
      process.exit(0);
    }

    const stampDetection = pod.stampDetection;

    console.log("\n📌 Stamps Found:", stampDetection.stamps?.length || 0);
    if (stampDetection.stamps && stampDetection.stamps.length > 0) {
      stampDetection.stamps.forEach((stamp, idx) => {
        console.log(`  ${idx + 1}. ${stamp.type}`);
        console.log(`     Present: ${stamp.present}`);
        console.log(`     Confidence: ${stamp.confidence || "N/A"}`);
        if (stamp.text) console.log(`     Text: "${stamp.text}"`);
      });
    } else {
      console.log("  (None detected)");
    }

    console.log(
      "\n✍️  Signatures Found:",
      stampDetection.signatures?.length || 0
    );
    if (stampDetection.signatures && stampDetection.signatures.length > 0) {
      stampDetection.signatures.forEach((sig, idx) => {
        console.log(`  ${idx + 1}. ${sig.type}`);
        console.log(`     Present: ${sig.present}`);
        console.log(`     Confidence: ${sig.confidence || "N/A"}`);
        if (sig.location) console.log(`     Location: ${sig.location}`);
      });
    } else {
      console.log("  (None detected)");
    }

    console.log();
    console.log("=".repeat(80));
    console.log("🔍 VALIDATION CHECK RESULTS");
    console.log("=".repeat(80));

    // Check specific stamps/signatures needed
    const hasDispatchStamp =
      stampDetection.stamps?.some((s) => s.type === "DISPATCH") || false;
    const hasPalletStamp =
      stampDetection.stamps?.some((s) => s.type === "PALLET") || false;
    const hasSecuritySig =
      stampDetection.signatures?.some(
        (s) => s.type === "SECURITY" && s.present
      ) || false;

    console.log(
      `\n✓ Dispatch stamp: ${hasDispatchStamp ? "✅ FOUND" : "❌ NOT FOUND"}`
    );
    console.log(
      `✓ Pallet stamp: ${hasPalletStamp ? "✅ FOUND" : "❌ NOT FOUND"}`
    );
    console.log(
      `✓ Security signature: ${hasSecuritySig ? "✅ FOUND" : "❌ NOT FOUND"}`
    );

    console.log();
    console.log("=".repeat(80));
    console.log("📝 RAW TEXT SAMPLE (for manual verification)");
    console.log("=".repeat(80));
    const rawText = pod.extractedData?.rawText || "";
    console.log(rawText.substring(0, 800));
    if (rawText.length > 800) console.log("...");

    console.log();
    console.log("=".repeat(80));
    console.log("💡 ANALYSIS");
    console.log("=".repeat(80));

    if (hasDispatchStamp && hasPalletStamp && hasSecuritySig) {
      console.log("✅ All required stamps/signatures are detected!");
      console.log("   The validation is passing correctly.");
    } else {
      console.log("⚠️  Some stamps/signatures are missing!");
      console.log();

      if (!hasDispatchStamp) {
        console.log("❌ Dispatch stamp not detected");
        console.log(
          '   - Check if raw text contains "dispatch", "shipment", etc.'
        );
        console.log("   - Verify OCR quality");
      }

      if (!hasPalletStamp) {
        console.log("❌ Pallet stamp not detected");
        console.log('   - Check if raw text contains "pallet"');
        console.log("   - Verify OCR quality");
      }

      if (!hasSecuritySig) {
        console.log("❌ Security signature not detected");
        console.log(
          '   - Check if raw text contains "security", "guard on duty"'
        );
        console.log("   - Verify signature detection logic");
      }

      console.log();
      console.log("📌 If these SHOULD be failing but are showing as passed:");
      console.log("   - The stamp detection is incorrectly detecting them");
      console.log("   - Patterns may be too loose/permissive");
      console.log("   - Need to tighten detection logic");
    }

    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
