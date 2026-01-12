/**
 * Test script for Client Config Admin API
 * Tests CRUD operations for client validation configurations
 */

const BASE_URL = "http://localhost:3000/api/v1/admin";

// Helper function for API calls
async function apiCall(endpoint, method = "GET", body = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    console.error("API call failed:", error.message);
    return { status: 0, error: error.message };
  }
}

async function testAdminAPI() {
  console.log("========================================");
  console.log("Testing Client Config Admin API");
  console.log("========================================\n");

  // 1. Get all clients
  console.log("1. GET /api/v1/admin/clients - Get all client configs");
  const allClients = await apiCall("/clients");
  console.log(`Status: ${allClients.status}`);
  console.log("Response:", JSON.stringify(allClients.data, null, 2));
  console.log("\n");

  // 2. Get SUPER8 config
  console.log("2. GET /api/v1/admin/clients/SUPER8 - Get SUPER8 config");
  const super8 = await apiCall("/clients/SUPER8");
  console.log(`Status: ${super8.status}`);
  if (super8.data.success) {
    console.log("SUPER8 Config found:");
    console.log("- Client ID:", super8.data.data.clientId);
    console.log("- Client Name:", super8.data.data.clientName);
    console.log("- Has Custom Config:", super8.data.meta?.hasCustomConfig);
    console.log("- Is Hardcoded:", super8.data.meta?.isHardcoded);
    console.log(
      "- Validation Rules:",
      JSON.stringify(super8.data.data.validationRules, null, 2)
    );
  }
  console.log("\n");

  // 3. Preview SUPER8 validation checks
  console.log(
    "3. GET /api/v1/admin/clients/SUPER8/preview - Preview validation checks"
  );
  const preview = await apiCall("/clients/SUPER8/preview");
  console.log(`Status: ${preview.status}`);
  if (preview.data.success) {
    console.log("Validation Preview:");
    console.log(JSON.stringify(preview.data.data, null, 2));
  }
  console.log("\n");

  // 4. Create a new test client config
  console.log("4. POST /api/v1/admin/clients - Create TEST_CLIENT config");
  const newClient = {
    clientId: "TEST_CLIENT",
    clientName: "Test Client Corp",
    description: "Test client with minimal validation requirements",
    validationRules: {
      documentCompleteness: {
        requirePalletNotificationLetter: false,
        requireLoscamDocument: false,
        requireCustomerPalletReceiving: false,
        requireShipDocument: true,
        requireInvoice: true,
        requireRAR: true,
        palletScenario: "AUTO_DETECT",
      },
      palletValidation: {
        enabled: false,
        requireWarehouseStamp: false,
        requireWarehouseSignature: false,
        requireCustomerSignature: false,
        requireDriverSignature: false,
        requireLoscamStamp: false,
      },
      shipDocumentValidation: {
        enabled: true,
        requireDispatchStamp: true,
        requirePalletStamp: false,
        requireNoPalletStamp: false,
        requireSecuritySignature: false,
        requireTimeOutField: false,
        requireDriverSignature: false,
      },
      invoiceValidation: {
        enabled: true,
        requirePOMatch: true,
        requireTotalCasesMatch: true,
        allowedVariancePercent: 5, // Allow 5% variance
        requireItemLevelMatch: false,
        compareFields: ["poNumber", "totalCases"],
      },
      crossDocumentValidation: {
        enabled: false,
        validateInvoiceRAR: false,
        allowedDiscrepancyCount: 0,
        strictMode: false,
      },
    },
    updatedBy: "TEST_ADMIN",
  };

  const createResult = await apiCall("/clients", "POST", newClient);
  console.log(`Status: ${createResult.status}`);
  console.log("Response:", JSON.stringify(createResult.data, null, 2));
  console.log("\n");

  // 5. Get the newly created client
  console.log("5. GET /api/v1/admin/clients/TEST_CLIENT - Get created config");
  const testClient = await apiCall("/clients/TEST_CLIENT");
  console.log(`Status: ${testClient.status}`);
  if (testClient.data.success) {
    console.log(
      "TEST_CLIENT found with custom config:",
      testClient.data.meta?.hasCustomConfig
    );
  }
  console.log("\n");

  // 6. Update the test client
  console.log("6. PUT /api/v1/admin/clients/TEST_CLIENT - Update config");
  const updateData = {
    clientName: "Test Client Corp (Updated)",
    description: "Updated description with stricter rules",
    validationRules: {
      ...newClient.validationRules,
      invoiceValidation: {
        ...newClient.validationRules.invoiceValidation,
        allowedVariancePercent: 2, // Reduce variance to 2%
        requireItemLevelMatch: true, // Enable item-level matching
      },
    },
    updatedBy: "TEST_ADMIN",
  };

  const updateResult = await apiCall("/clients/TEST_CLIENT", "PUT", updateData);
  console.log(`Status: ${updateResult.status}`);
  console.log("Response:", JSON.stringify(updateResult.data, null, 2));
  console.log("\n");

  // 7. Clear cache
  console.log("7. POST /api/v1/admin/clients/cache/clear - Clear cache");
  const clearResult = await apiCall("/clients/cache/clear", "POST", {
    clientId: "TEST_CLIENT",
  });
  console.log(`Status: ${clearResult.status}`);
  console.log("Response:", JSON.stringify(clearResult.data, null, 2));
  console.log("\n");

  // 8. Deactivate test client
  console.log(
    "8. DELETE /api/v1/admin/clients/TEST_CLIENT - Deactivate config"
  );
  const deleteResult = await apiCall("/clients/TEST_CLIENT", "DELETE", {
    deactivatedBy: "TEST_ADMIN",
  });
  console.log(`Status: ${deleteResult.status}`);
  console.log("Response:", JSON.stringify(deleteResult.data, null, 2));
  console.log("\n");

  // 9. Try to get deactivated client
  console.log(
    "9. GET /api/v1/admin/clients/TEST_CLIENT - Try to get deactivated config"
  );
  const deactivatedClient = await apiCall("/clients/TEST_CLIENT");
  console.log(`Status: ${deactivatedClient.status}`);
  console.log("Response:", JSON.stringify(deactivatedClient.data, null, 2));
  console.log("\n");

  // 10. Try to deactivate SUPER8 (should fail)
  console.log(
    "10. DELETE /api/v1/admin/clients/SUPER8 - Try to deactivate SUPER8 (should fail)"
  );
  const failedDelete = await apiCall("/clients/SUPER8", "DELETE", {
    deactivatedBy: "TEST_ADMIN",
  });
  console.log(`Status: ${failedDelete.status}`);
  console.log("Response:", JSON.stringify(failedDelete.data, null, 2));
  console.log("\n");

  console.log("========================================");
  console.log("Admin API Test Complete");
  console.log("========================================");
}

// Run tests
testAdminAPI().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
