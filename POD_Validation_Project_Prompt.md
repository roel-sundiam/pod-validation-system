# POD Validation System – Project Prompt

## Objective
Build an automated Proof of Delivery (POD) validation system that reduces manual human checking, minimizes errors, and flags exceptions (“peculiarities”) for review.

The system should work across multiple clients, each potentially using different POD document formats.

---

## Technology Stack
- **Frontend:** Angular
- **Backend:** Node.js with Express.js
- **Database:** Yes (recommended)
  - MongoDB (preferred for flexible schemas)
  - PostgreSQL is acceptable if relational structure is required

---

## Supported POD Formats
- Scanned paper PODs (images)
- Scanned or digital PDFs
- Structured files (Excel / CSV)

---

## High-Level Workflow

1. User uploads POD document(s) via Angular frontend
2. Backend (Express.js) processes the file
3. OCR / file parsing extracts relevant data
4. Extracted data is normalized into a standard internal schema
5. Rules-based validation is applied
6. Peculiarities and discrepancies are detected
7. Validation result is stored in the database
8. Results are returned to the frontend for display

---

## Core Functional Requirements

### 1. POD Upload
- Upload single or multiple POD files
- Accept images, PDFs, Excel, and CSV
- Optional client/template identifier

---

### 2. Data Extraction
- OCR for images and scanned PDFs
- Direct parsing for Excel / CSV
- Extract:
  - Delivery date
  - Recipient information
  - Item list and quantities
  - Signature regions
  - Remarks (optional)

---

### 3. Data Normalization
Convert extracted data into a standard internal format, regardless of client layout.

Example schema:

```json
{
  "delivery_date": "",
  "recipient_name": "",
  "signatures": {
    "driver": false,
    "receiver": false
  },
  "items": [
    { "item_code": "", "quantity": 0 }
  ]
}
```

---

### 4. Validation Rules (No AI Required)

#### Signature Validation
- Validate presence of **two required signatures**
  - Driver signature
  - Receiver signature
- Signature detection is **presence-based**, not identity-based

#### Data Validation
- Required fields must not be empty
- Delivered quantity must match expected quantity
- Detect shortages or over-deliveries

#### Document Quality Checks
- Blurry image detection
- Cropped or incomplete document detection
- Poor contrast or unreadable content

---

### 5. Peculiarity Detection

Flag PODs for review when:
- One or more signatures are missing or unclear
- Image quality is poor
- Layout does not match expected template
- Quantities do not match expected values
- Handwritten remarks indicate partial delivery or issues

Peculiarities should trigger **REVIEW**, not automatic failure.

---

### 6. Validation Output

Each POD must return a structured validation result:

- **PASS** – Fully valid
- **FAIL** – Blocking issues
- **REVIEW** – Peculiarities detected

Example output:

```json
{
  "status": "REVIEW",
  "summary": "Receiver signature found, driver signature missing",
  "checks": {
    "signatures": {
      "expected": 2,
      "found": 1
    },
    "image_quality": {
      "blurry": true
    },
    "items": {
      "matched": true
    }
  }
}
```

---

## Database Requirements

### Minimum Data to Store
- POD metadata (file reference, client, upload date)
- Validation results and status
- Detected peculiarities
- Validation timestamps
- Optional audit logs

---

## Architecture Overview

```
Angular Frontend
   ↓
Express.js API
   ↓
OCR / Image Processing
   ↓
Rules-Based Validation Engine
   ↓
Database
   ↓
Validation Results Dashboard
```

---

## Design Principles
- Rules-based and deterministic
- Explainable validation decisions
- Scalable across multiple clients
- AI optional and not required for MVP
- Unknown formats should be flagged for manual review, not failed

---

## MVP Scope
- POD upload
- Signature presence validation
- Basic document quality checks
- Quantity comparison
- Validation result storage
- Simple Angular dashboard

---

## Future Enhancements (Optional)
- Client-specific templates
- Confidence / risk scoring
- AI-assisted anomaly detection
- Advanced handwriting analysis
- Analytics and reporting dashboard

---

## Key Goal
Minimize manual POD validation while maintaining accuracy, transparency, and auditability.
