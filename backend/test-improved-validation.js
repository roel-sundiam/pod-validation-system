const mongoose = require("mongoose");
require("dotenv").config();

const DELIVERY_REF = "DEL-1768137659009-5be1fa98";

mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/pod-validation"
  )
  .then(async () => {
    console.log("🔄 Testing Improved Validation Logic\n");

    const {
      initializeValidationRegistry,
      validationRegistry,
    } = require("./dist/backend/src/services/validation-registry.service.js");
    const {
      DeliveryModel,
    } = require("./dist/backend/src/models/delivery.model.js");
    const { PODModel } = require("./dist/backend/src/models/pod.model.js");

    await initializeValidationRegistry();

    const delivery = await DeliveryModel.findOne({
      deliveryReference: DELIVERY_REF,
    });

    if (!delivery) {
      console.log("❌ Delivery not found!");
      process.exit(1);
    }

    const podIds = delivery.documents.map((d) => d.podId);
    const pods = await PODModel.find({ _id: { $in: podIds } });

    console.log("📦 Delivery:", delivery.deliveryReference);
    console.log("Documents:", delivery.documents.length);
    console.log();

    // Get validator
    const validator = validationRegistry.getValidator("SUPER8");
    console.log("Running validation with:", validator.getName());
    console.log();

    // Run validation
    const validationResult = await validator.validate(delivery, pods);

    console.log("=".repeat(80));
    console.log("📋 VALIDATION RESULT");
    console.log("=".repeat(80));
    console.log("Status:", validationResult.status);
    console.log("Summary:", validationResult.message);
    console.log();

    // Show Invoice Validation section
    const invoiceValidation = validationResult.checklist?.invoiceValidation;
    if (invoiceValidation && invoiceValidation.length > 0) {
      console.log("💰 Invoice Validation:");
      invoiceValidation.forEach((check) => {
        const icon =
          check.status === "PASSED"
            ? "✅"
            : check.status === "FAILED"
            ? "❌"
            : "⚠️ ";
        console.log(`${icon} ${check.name}`);
        console.log(`   ${check.message}`);

        if (check.details) {
          console.log(`   Details:`, JSON.stringify(check.details, null, 2));
        }
        console.log();
      });
    } else {
      console.log("⚠️  No Invoice Validation section found");
    }

    // Save to database
    await DeliveryModel.updateOne(
      { _id: delivery._id },
      {
        $set: {
          deliveryValidation: validationResult,
          status: "COMPLETED",
        },
      }
    );

    console.log("✅ Validation saved to database!");
    console.log();
    console.log("=".repeat(80));
    console.log("📝 SUMMARY OF IMPROVEMENTS");
    console.log("=".repeat(80));
    console.log("✓ Header rows and garbage data now filtered from items");
    console.log(
      "✓ Fallback to summary extraction when item data is unreliable"
    );
    console.log("✓ Better handling of low OCR confidence documents");
    console.log("✓ Improved display of validation details in frontend");
    console.log();
    console.log("🔄 Please refresh your frontend to see the updated results!");

    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Error:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
