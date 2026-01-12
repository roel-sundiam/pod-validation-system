const mongoose = require("mongoose");
require("dotenv").config();

// You can change this to your specific delivery ID or reference
const DELIVERY_REF = "DEL-1768137659009-5be1fa98"; // Or use a specific ObjectId

mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/pod-validation"
  )
  .then(async () => {
    console.log("🔍 Diagnosing Case Mismatch Issue\n");

    // Find the delivery
    const delivery = await mongoose.connection
      .collection("deliveries")
      .findOne({
        deliveryReference: DELIVERY_REF,
      });

    if (!delivery) {
      console.log("❌ Delivery not found!");
      process.exit(1);
    }

    console.log("📦 Delivery:", delivery.deliveryReference);
    console.log("Status:", delivery.status);
    console.log("Documents:", delivery.documents.length);
    console.log();

    // Find Invoice and RAR documents
    const invoiceDoc = delivery.documents.find(
      (d) => d.detectedType === "INVOICE"
    );
    const rarDoc = delivery.documents.find((d) => d.detectedType === "RAR");

    if (!invoiceDoc) {
      console.log("❌ No INVOICE document found!");
      process.exit(1);
    }

    if (!rarDoc) {
      console.log("❌ No RAR document found!");
      process.exit(1);
    }

    // Fetch the POD documents
    const invoicePod = await mongoose.connection.collection("pods").findOne({
      _id: invoiceDoc.podId,
    });

    const rarPod = await mongoose.connection.collection("pods").findOne({
      _id: rarDoc.podId,
    });

    console.log("=".repeat(80));
    console.log("📄 INVOICE DOCUMENT ANALYSIS");
    console.log("=".repeat(80));
    console.log("File:", invoicePod.fileMetadata?.originalName);
    console.log(
      "OCR Confidence:",
      invoicePod.processingMetadata?.ocrConfidence + "%"
    );
    console.log();

    // Analyze Invoice Items
    const invoiceItems = invoicePod.extractedData?.normalized?.items || [];
    console.log("📊 Invoice Items Count:", invoiceItems.length);

    if (invoiceItems.length === 0) {
      console.log("⚠️  WARNING: No normalized items found in Invoice!");
      console.log("   This could mean:");
      console.log("   - OCR failed to extract item data");
      console.log("   - Normalization service didn't parse items");
      console.log("   - Document structure is not recognized");
    } else {
      console.log("\nFirst 5 Items:");
      invoiceItems.slice(0, 5).forEach((item, idx) => {
        console.log(
          `  ${idx + 1}. ${item.description || item.itemCode || "Unknown"}`
        );
        console.log(`     Item Code: ${item.itemCode || "N/A"}`);
        console.log(`     Delivered Qty: ${item.deliveredQuantity ?? "N/A"}`);
        console.log(`     Expected Qty: ${item.expectedQuantity ?? "N/A"}`);
        console.log(`     Unit: ${item.unit || "N/A"}`);
      });

      if (invoiceItems.length > 5) {
        console.log(`  ... and ${invoiceItems.length - 5} more items`);
      }
    }

    // Calculate total using same logic as validator
    const invoiceTotal = invoiceItems.reduce(
      (sum, item) => sum + (item.deliveredQuantity || 0),
      0
    );

    console.log("\n💰 Invoice Total Cases (sum of deliveredQuantity):");
    console.log(`   ${invoiceTotal}`);

    // Show breakdown
    const invoiceDeliveredCount = invoiceItems.filter(
      (i) => i.deliveredQuantity > 0
    ).length;
    const invoiceExpectedCount = invoiceItems.filter(
      (i) => i.expectedQuantity > 0
    ).length;
    console.log(
      `   Items with deliveredQuantity > 0: ${invoiceDeliveredCount}`
    );
    console.log(`   Items with expectedQuantity > 0: ${invoiceExpectedCount}`);

    console.log();
    console.log("=".repeat(80));
    console.log("📄 RAR DOCUMENT ANALYSIS");
    console.log("=".repeat(80));
    console.log("File:", rarPod.fileMetadata?.originalName);
    console.log(
      "OCR Confidence:",
      rarPod.processingMetadata?.ocrConfidence + "%"
    );
    console.log();

    // Analyze RAR Items
    const rarItems = rarPod.extractedData?.normalized?.items || [];
    console.log("📊 RAR Items Count:", rarItems.length);

    if (rarItems.length === 0) {
      console.log("⚠️  WARNING: No normalized items found in RAR!");
    } else {
      console.log("\nFirst 5 Items:");
      rarItems.slice(0, 5).forEach((item, idx) => {
        console.log(
          `  ${idx + 1}. ${item.description || item.itemCode || "Unknown"}`
        );
        console.log(`     Item Code: ${item.itemCode || "N/A"}`);
        console.log(`     Delivered Qty: ${item.deliveredQuantity ?? "N/A"}`);
        console.log(`     Expected Qty: ${item.expectedQuantity ?? "N/A"}`);
        console.log(`     Unit: ${item.unit || "N/A"}`);
      });

      if (rarItems.length > 5) {
        console.log(`  ... and ${rarItems.length - 5} more items`);
      }
    }

    // Calculate total using same logic as validator
    const rarTotal = rarItems.reduce(
      (sum, item) =>
        sum + (item.deliveredQuantity || item.expectedQuantity || 0),
      0
    );

    console.log(
      "\n💰 RAR Total Cases (sum of deliveredQuantity || expectedQuantity):"
    );
    console.log(`   ${rarTotal}`);

    // Show breakdown
    const rarDeliveredCount = rarItems.filter(
      (i) => i.deliveredQuantity > 0
    ).length;
    const rarExpectedCount = rarItems.filter(
      (i) => i.expectedQuantity > 0
    ).length;
    console.log(`   Items with deliveredQuantity > 0: ${rarDeliveredCount}`);
    console.log(`   Items with expectedQuantity > 0: ${rarExpectedCount}`);

    console.log();
    console.log("=".repeat(80));
    console.log("🔍 MISMATCH ANALYSIS");
    console.log("=".repeat(80));
    console.log(`Invoice Total: ${invoiceTotal}`);
    console.log(`RAR Total: ${rarTotal}`);
    console.log(`Difference: ${Math.abs(invoiceTotal - rarTotal)}`);
    console.log(`Match: ${invoiceTotal === rarTotal ? "✅ YES" : "❌ NO"}`);

    if (invoiceTotal !== rarTotal) {
      console.log("\n🚨 DISCREPANCY DETECTED!");

      // Possible reasons
      console.log("\nPossible Reasons:");

      if (invoiceTotal === 0 || rarTotal === 0) {
        console.log(
          "  ⚠️  One document has zero total - likely a parsing/OCR issue"
        );
      }

      if (invoiceItems.length === 0 || rarItems.length === 0) {
        console.log("  ⚠️  One document has no items - normalization failed");
      }

      if (Math.abs(invoiceTotal - rarTotal) > 1000) {
        console.log(
          "  ⚠️  Large discrepancy suggests wrong field is being summed"
        );
        console.log("      (e.g., line numbers instead of quantities)");
      }

      // Check if quantities look like line numbers
      const invoiceAvg = invoiceTotal / (invoiceItems.length || 1);
      const rarAvg = rarTotal / (rarItems.length || 1);

      if (rarAvg > 100 && invoiceAvg < 10) {
        console.log(
          "  ⚠️  RAR average per item is very high - might be summing wrong field"
        );
        console.log(
          `      Invoice avg: ${invoiceAvg.toFixed(
            2
          )}, RAR avg: ${rarAvg.toFixed(2)}`
        );
      }
    }

    // Show sample raw text for inspection
    console.log();
    console.log("=".repeat(80));
    console.log("📝 RAW TEXT SAMPLES (for manual inspection)");
    console.log("=".repeat(80));

    console.log("\n--- INVOICE Raw Text (first 500 chars) ---");
    const invoiceRawText = invoicePod.extractedData?.rawText || "";
    console.log(invoiceRawText.substring(0, 500));
    console.log("...");

    console.log("\n--- RAR Raw Text (first 500 chars) ---");
    const rarRawText = rarPod.extractedData?.rawText || "";
    console.log(rarRawText.substring(0, 500));
    console.log("...");

    // Check validation result details
    console.log();
    console.log("=".repeat(80));
    console.log("📋 VALIDATION RESULT (from database)");
    console.log("=".repeat(80));

    const invoiceValidation =
      delivery.deliveryValidation?.checklist?.invoiceValidation;
    if (invoiceValidation) {
      invoiceValidation.forEach((check) => {
        const icon =
          check.status === "PASSED"
            ? "✓"
            : check.status === "FAILED"
            ? "✗"
            : "⚠";
        console.log(`${icon} ${check.name}`);
        console.log(`   ${check.message}`);

        if (check.details) {
          console.log(`   Details:`, JSON.stringify(check.details, null, 2));
        }
      });
    } else {
      console.log("No invoice validation section found");
    }

    console.log();
    console.log("=".repeat(80));
    console.log("💡 RECOMMENDATIONS");
    console.log("=".repeat(80));

    if (invoiceItems.length === 0) {
      console.log("1. Re-process Invoice document - items not extracted");
      console.log(
        "2. Check if Invoice format is supported by normalization service"
      );
      console.log(
        "3. Review OCR quality - confidence was " +
          invoicePod.processingMetadata?.ocrConfidence +
          "%"
      );
    }

    if (rarItems.length === 0) {
      console.log("1. Re-process RAR document - items not extracted");
      console.log(
        "2. Check if RAR format is supported by normalization service"
      );
      console.log(
        "3. Review OCR quality - confidence was " +
          rarPod.processingMetadata?.ocrConfidence +
          "%"
      );
    }

    if (
      invoiceTotal !== rarTotal &&
      invoiceItems.length > 0 &&
      rarItems.length > 0
    ) {
      console.log(
        "1. Verify the correct field is being used (deliveredQuantity vs expectedQuantity)"
      );
      console.log(
        "2. Check if quantities are in the same unit (cases vs pieces vs pallets)"
      );
      console.log("3. Review item-by-item discrepancies to identify pattern");
    }

    console.log();
    console.log("✅ Diagnostic complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
