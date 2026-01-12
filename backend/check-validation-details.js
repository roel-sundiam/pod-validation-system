const mongoose = require("mongoose");
require("dotenv").config();

const DELIVERY_REF = "DEL-1768137659009-5be1fa98";

mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/pod-validation"
  )
  .then(async () => {
    console.log("🔍 Checking Validation Details in Database\n");

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
    console.log("Validation Status:", delivery.deliveryValidation?.status);
    console.log();

    // Check the checklist structure
    const checklist = delivery.deliveryValidation?.checklist;

    if (checklist) {
      console.log("=".repeat(80));
      console.log("📋 VALIDATION CHECKLIST");
      console.log("=".repeat(80));

      // Document Completeness
      if (
        checklist.documentCompleteness &&
        checklist.documentCompleteness.length > 0
      ) {
        console.log("\n✅ Document Completeness:");
        checklist.documentCompleteness.forEach((check) => {
          const icon =
            check.status === "PASSED"
              ? "✓"
              : check.status === "FAILED"
              ? "✗"
              : "⚠";
          console.log(`  ${icon} ${check.name}`);
          console.log(`     ${check.message}`);
          if (check.details) {
            console.log(
              `     Details:`,
              JSON.stringify(check.details, null, 2)
            );
          }
        });
      }

      // Document-Specific Checks
      if (
        checklist.documentSpecificChecks &&
        checklist.documentSpecificChecks.length > 0
      ) {
        checklist.documentSpecificChecks.forEach((docCheck) => {
          console.log(`\n📄 ${docCheck.documentType} Validation:`);
          if (docCheck.checks && docCheck.checks.length > 0) {
            docCheck.checks.forEach((check) => {
              const icon =
                check.status === "PASSED"
                  ? "✓"
                  : check.status === "FAILED"
                  ? "✗"
                  : "⚠";
              console.log(`  ${icon} ${check.name}`);
              console.log(`     ${check.message}`);
              if (check.details) {
                console.log(
                  `     Details:`,
                  JSON.stringify(check.details, null, 2)
                );
              }
            });
          }
        });
      }

      // Cross-Document Checks
      if (
        checklist.crossDocumentChecks &&
        checklist.crossDocumentChecks.length > 0
      ) {
        console.log("\n🔄 Cross-Document Checks:");
        checklist.crossDocumentChecks.forEach((check) => {
          const icon =
            check.status === "PASSED"
              ? "✓"
              : check.status === "FAILED"
              ? "✗"
              : "⚠";
          console.log(`  ${icon} ${check.name}`);
          console.log(`     ${check.message}`);
          if (check.details) {
            console.log(
              `     Details:`,
              JSON.stringify(check.details, null, 2)
            );
          }
        });
      }
    } else {
      console.log("⚠️  No checklist found in validation result");
    }

    console.log();
    console.log("=".repeat(80));
    console.log("📊 KEY FINDINGS");
    console.log("=".repeat(80));

    // Find invoice validation checks
    const invoiceChecks =
      checklist?.documentSpecificChecks?.find(
        (d) => d.documentType === "INVOICE"
      )?.checks || [];

    if (invoiceChecks.length > 0) {
      const caseMatchCheck = invoiceChecks.find((c) =>
        c.name.includes("Total number of cases")
      );

      if (caseMatchCheck) {
        console.log("\n💰 Case Matching Result:");
        console.log(`   Status: ${caseMatchCheck.status}`);
        console.log(`   Message: ${caseMatchCheck.message}`);

        if (caseMatchCheck.details) {
          const details = caseMatchCheck.details;
          console.log(`   Invoice Total: ${details.invoiceTotal || "N/A"}`);
          console.log(`   RAR Total: ${details.rarTotal || "N/A"}`);
          console.log(`   Invoice Source: ${details.invoiceSource || "N/A"}`);
          console.log(`   RAR Source: ${details.rarSource || "N/A"}`);
          console.log(`   Invoice OCR: ${details.invoiceOCR || "N/A"}%`);
          console.log(`   RAR OCR: ${details.rarOCR || "N/A"}%`);

          if (
            details.invoiceSource === "summary extraction" ||
            details.rarSource === "summary extraction"
          ) {
            console.log("\n   ℹ️  Note: Fallback extraction was used due to:");
            if (details.invoiceOCR < 60)
              console.log("      - Low Invoice OCR confidence");
            if (details.rarOCR < 60)
              console.log("      - Low RAR OCR confidence");
            if (details.invoiceTotal > 500)
              console.log("      - Suspiciously high Invoice total");
            if (details.rarTotal > 500)
              console.log("      - Suspiciously high RAR total");
          }
        }
      }
    } else {
      console.log("⚠️  No invoice validation checks found");
    }

    console.log();
    console.log("✅ Diagnostic complete!");
    console.log("\n📝 The validation results can be viewed in:");
    console.log("   - Upload progress dialog (when processing documents)");
    console.log("   - Document viewer page");
    console.log("   - Dashboard delivery details");

    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
