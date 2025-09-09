const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
const documentsDir = path.join(uploadsDir, 'documents');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, documentsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: maidId_documentType_timestamp.ext
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const maidId = req.user?.id || 'unknown';
    const documentType = req.body?.type || 'document';
    const ext = path.extname(file.originalname);
    cb(null, `${maidId}_${documentType}_${uniqueSuffix}${ext}`);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedMimeTypes = [
    'image/jpeg',
    
    'image/png',
    'image/gif',
    'application/pdf',
    'image/webp'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP and PDF files are allowed.'), false);
  }
};

// Configure multer for single file
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1 // Only one file at a time
  }
});

// Configure multer for multiple verification documents
const uploadMultiple = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 5 // Maximum 5 files for verification
  }
});

// Middleware for single file upload
const uploadSingle = upload.single('document');

// Middleware for multiple verification documents upload
const uploadVerificationDocuments = uploadMultiple.fields([
  { name: 'aadharCard', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'electricityBill', maxCount: 1 },
  { name: 'policeVerification', maxCount: 1 },
  { name: 'photo', maxCount: 1 }
]);

// Wrapper to handle multer errors for single file
const handleFileUpload = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size is 5MB.'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: 'Too many files. Only one file is allowed.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'File upload error: ' + err.message
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded.'
      });
    }
    
    next();
  });
};

// Wrapper to handle multer errors for multiple verification documents
const handleVerificationUpload = (req, res, next) => {
  uploadVerificationDocuments(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: 'One or more files are too large. Maximum size is 5MB per file.'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          message: 'Too many files uploaded.'
        });
      }
      return res.status(400).json({
        success: false,
        message: 'File upload error: ' + err.message
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    
    // Check if at least one file was uploaded
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded.'
      });
    }
    
    next();
  });
};

// Utility function to validate document type
const validateDocumentType = (type) => {
  const validTypes = [
    'AADHAR_CARD',
    'PAN_CARD', 
    'VOTER_ID',
    'DRIVING_LICENSE',
    'PASSPORT',
    'ADDRESS_PROOF',
    'POLICE_VERIFICATION',
    'MEDICAL_CERTIFICATE',
    'BANK_ACCOUNT_PROOF',
    'PHOTO'
  ];
  
  return validTypes.includes(type);
};

// Utility function to get file URL
const getFileUrl = (filename) => {
  return `/uploads/documents/${filename}`;
};

// Utility function to delete file
const deleteFile = (filename) => {
  const filePath = path.join(documentsDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
};

// Get required documents for maids (3 essential documents as per user requirements)
const getRequiredDocuments = () => {
  return [
    {
      type: 'AADHAR_CARD',
      name: 'Aadhar Card',
      description: 'Government issued identity proof (front and back)',
      required: true
    },
    {
      type: 'PAN_CARD',
      name: 'PAN Card',
      description: 'Tax identification document',
      required: true
    },
    {
      type: 'ADDRESS_PROOF',
      name: 'Electricity Bill',
      description: 'Recent electricity bill for address verification (within last 3 months)',
      required: true
    }
  ];
};

module.exports = {
  handleFileUpload,
  handleVerificationUpload,
  validateDocumentType,
  getFileUrl,
  deleteFile,
  getRequiredDocuments,
  uploadsDir,
  documentsDir
};
