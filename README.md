# POD Validation System

An automated Proof of Delivery (POD) validation system with OCR, image processing, and rules-based validation.

## Features

✅ **File Upload**: Upload POD documents (images, PDFs, Excel, CSV)
✅ **OCR Processing**: Extract text from images/PDFs using Tesseract.js
✅ **Data Normalization**: Convert extracted data to standard format
✅ **Signature Detection**: Detect driver and receiver signatures
✅ **Image Quality Analysis**: Detect blur, low contrast, and resolution issues
✅ **Rules-Based Validation**: Validate signatures, quantities, and required fields
✅ **Peculiarity Detection**: Flag issues for manual review
✅ **RESTful API**: Complete API for upload, processing, and results
✅ **MongoDB Storage**: Store POD documents and validation results

## Technology Stack

- **Backend**: Node.js + Express.js + TypeScript
- **Database**: MongoDB with Mongoose
- **OCR**: Tesseract.js (open source, local processing)
- **Image Processing**: Sharp
- **PDF Processing**: pdf-parse, pdf2pic
- **File Parsing**: xlsx, csv-parse
- **Logging**: Winston
- **Validation**: Express-validator

## Project Structure

```
POD_Validation/
├── backend/                    # Node.js/Express API
│   ├── src/
│   │   ├── server.ts          # Application entry point
│   │   ├── config/            # Configuration files
│   │   │   ├── database.ts
│   │   │   ├── multer.ts
│   │   │   └── validation-rules.ts
│   │   ├── models/            # MongoDB models
│   │   │   ├── pod.model.ts
│   │   │   └── audit-log.model.ts
│   │   ├── services/          # Business logic
│   │   │   ├── ocr.service.ts
│   │   │   ├── validation.service.ts
│   │   │   ├── normalization.service.ts
│   │   │   ├── image-quality.service.ts
│   │   │   ├── signature-detection.service.ts
│   │   │   ├── file-parser.service.ts
│   │   │   └── processing.service.ts
│   │   ├── controllers/       # Request handlers
│   │   │   ├── upload.controller.ts
│   │   │   └── results.controller.ts
│   │   ├── routes/            # API routes
│   │   ├── middleware/        # Express middleware
│   │   └── utils/             # Utility functions
│   ├── uploads/               # Temporary file storage
│   └── package.json
│
├── frontend/                  # Angular application (to be implemented)
├── shared/                    # Shared TypeScript types
│   └── types/
│       └── pod-schema.ts
└── package.json               # Root workspace configuration
```

## Installation

### Prerequisites

- Node.js 18+ and npm
- MongoDB (local or cloud)
- Git

### Setup Steps

1. **Clone the repository** (or navigate to the project directory)

```bash
cd /mnt/c/Projects2/POD_Validation
```

2. **Install dependencies**

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd backend
npm install
```

3. **Configure environment variables**

```bash
cd backend
cp .env.example .env
```

Edit `.env` and configure:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/pod_validation
NODE_ENV=development
UPLOAD_MAX_SIZE=10485760
TESSERACT_LANG=eng
OCR_CONFIDENCE_THRESHOLD=60
BLUR_THRESHOLD=100
SIGNATURE_REQUIRED_COUNT=2
```

4. **Start MongoDB**

If using local MongoDB:

```bash
mongod
# or
sudo systemctl start mongod
```

5. **Start the backend server**

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Health Check

```bash
GET /api/v1/health
```

Returns server health status and database connection.

### Upload POD Files

```bash
POST /api/v1/pods/upload
Content-Type: multipart/form-data

Body:
- files: File[] (multiple files supported)
- clientIdentifier: string (optional)
- expectedData: JSON (optional)
```

**Example using curl:**

```bash
curl -X POST http://localhost:3000/api/v1/pods/upload \
  -F "files=@sample-pod.pdf" \
  -F "files=@sample-pod-2.jpg" \
  -F "clientIdentifier=CLIENT_001"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000",
    "filesReceived": 2,
    "estimatedProcessingTime": 4000
  }
}
```

### Get Job Status

```bash
GET /api/v1/pods/:jobId/status
```

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "COMPLETED",
    "progress": 100,
    "filesProcessed": 2,
    "filesTotal": 2,
    "podIds": ["pod_id_1", "pod_id_2"]
  }
}
```

### Get POD by ID

```bash
GET /api/v1/pods/:id
```

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "pod_id_1",
    "fileMetadata": { ... },
    "extractedData": { ... },
    "validationResult": {
      "status": "PASS",
      "summary": "POD validation passed",
      "checks": { ... },
      "peculiarities": []
    },
    "status": "COMPLETED"
  }
}
```

### List PODs with Filtering

```bash
GET /api/v1/pods?status=REVIEW&page=1&limit=20
```

**Query Parameters:**
- `status`: Filter by validation status (PASS/FAIL/REVIEW)
- `clientIdentifier`: Filter by client
- `dateFrom`: Filter by date (ISO format)
- `dateTo`: Filter by date (ISO format)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `sortBy`: Sort field (default: createdAt)
- `sortOrder`: Sort order (asc/desc, default: desc)

**Response:**

```json
{
  "success": true,
  "data": {
    "pods": [ ... ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 100,
      "itemsPerPage": 20
    }
  }
}
```

### Get Statistics

```bash
GET /api/v1/statistics/summary
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalProcessed": 150,
    "statusBreakdown": {
      "pass": 100,
      "fail": 5,
      "review": 45
    },
    "commonPeculiarities": [
      { "type": "SIGNATURE_MISSING", "count": 25 },
      { "type": "POOR_IMAGE_QUALITY", "count": 15 }
    ],
    "averageProcessingTime": 2500
  }
}
```

### Reprocess POD

```bash
POST /api/v1/pods/:id/reprocess
Content-Type: application/json

Body:
{
  "clientIdentifier": "NEW_CLIENT_ID"
}
```

### Download Original File

```bash
GET /api/v1/pods/:id/file
```

Returns the original uploaded file.

## Validation Rules

The system validates PODs based on configurable rules (see `backend/src/config/validation-rules.ts`):

### Signature Validation
- **Expected**: 2 signatures (driver + receiver)
- **Detection**: Image-based contour detection + text-based keywords
- **Result**: Flags missing signatures as HIGH severity

### Image Quality Validation
- **Blur Detection**: Laplacian variance < 100 triggers REVIEW
- **Contrast**: Minimum 15% contrast required
- **Resolution**: Minimum 400x400 pixels

### Required Fields Validation
- Items list (at least 1 item required)
- Delivery date (optional)
- Recipient name (optional)

### Quantity Validation
- Compares delivered vs expected quantities
- Allows 5% tolerance
- Flags shortages as HIGH severity
- Flags overages as MEDIUM severity

### Status Determination

- **PASS**: No peculiarities detected
- **REVIEW**: Peculiarities detected (missing signature, poor quality, quantity mismatch)
- **FAIL**: Critical processing errors (rare)

## Processing Pipeline

1. **Upload**: File uploaded via multipart/form-data
2. **Validation**: File type and size validated
3. **Storage**: File saved with SHA-256 checksum
4. **OCR/Parsing**:
   - Images/PDFs → Tesseract.js OCR
   - Excel/CSV → Direct parsing
5. **Normalization**: Extract structured data (dates, names, items, quantities)
6. **Signature Detection**: Detect signature regions using image analysis
7. **Quality Analysis**: Detect blur, contrast, resolution issues
8. **Validation**: Apply all validation rules
9. **Storage**: Save to MongoDB with validation results
10. **Audit**: Create audit log entry

## Testing

### Manual Testing with Sample Files

1. Create test files in `backend/test-data/`:
   - `sample-pod-clear.pdf` - High quality POD
   - `sample-pod-blurry.jpg` - Poor quality image
   - `sample-pod.xlsx` - Excel format
   - `sample-pod.csv` - CSV format

2. Upload files:

```bash
curl -X POST http://localhost:3000/api/v1/pods/upload \
  -F "files=@backend/test-data/sample-pod-clear.pdf"
```

3. Check processing status:

```bash
curl http://localhost:3000/api/v1/pods/{jobId}/status
```

4. View results:

```bash
curl http://localhost:3000/api/v1/pods/{podId}
```

## Logging

Logs are written to:
- Console (all levels)
- `backend/logs/error.log` (errors only)
- `backend/logs/combined.log` (all logs)

Log levels: error, warn, info, debug

## Security Features

✅ File type validation (magic number checking)
✅ File size limits (10MB default)
✅ Rate limiting (100 requests per 15 minutes)
✅ CORS configuration
✅ Helmet security headers
✅ Input validation with express-validator

## Performance Considerations

- **OCR Worker Pool**: Reuses Tesseract workers for better performance
- **Async Processing**: Files processed asynchronously to avoid blocking
- **Image Preprocessing**: Enhances image quality before OCR
- **Database Indexing**: Indexes on common query fields
- **Pagination**: List endpoints support pagination

## Troubleshooting

### MongoDB Connection Issues

```
Error: MongoDB connection failed
```

**Solution**: Ensure MongoDB is running and `MONGODB_URI` is correct in `.env`

### OCR Processing Slow

**Solution**: OCR is CPU-intensive. Processing time depends on:
- Image resolution (higher = slower)
- PDF page count
- Number of concurrent requests

### File Upload Fails

**Solution**: Check:
- File size < 10MB
- File type is supported (images, PDF, Excel, CSV)
- Disk space available in `backend/uploads/`

### Out of Memory

**Solution**: Reduce image resolution or implement job queue with Redis

## Next Steps

- [ ] Implement Angular frontend
- [ ] Add user authentication (JWT)
- [ ] Implement job queue (Redis + Bull)
- [ ] Add cloud storage integration (S3/Azure Blob)
- [ ] Implement WebSocket for real-time updates
- [ ] Add ML-based signature verification
- [ ] Implement client-specific templates
- [ ] Add batch operations UI
- [ ] Create analytics dashboard
- [ ] Add export functionality (CSV, Excel, PDF reports)

## License

ISC

## Support

For issues, questions, or contributions, please open an issue on the project repository.

---

**Built with** ❤️ **using Node.js, TypeScript, MongoDB, and Tesseract.js**
