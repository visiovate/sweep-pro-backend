const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const uploadsDir = path.join(__dirname, '../../uploads');
const documentsDir = path.join(uploadsDir, 'documents');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}

const ALLOWED_FILE_TYPES = Object.freeze({
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf']
});

const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;

const sanitizeSegment = (value, fallback = 'document') => {
  const cleaned = String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return cleaned || fallback;
};

const getSafeExtension = (file) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExts = ALLOWED_FILE_TYPES[file.mimetype] || [];
  return allowedExts.includes(ext) ? ext : null;
};

const hasExpectedSignature = (filePath, mimetype) => {
  const header = fs.readFileSync(filePath, { start: 0, end: 15 });

  if (mimetype === 'application/pdf') {
    return header.subarray(0, 5).toString('ascii') === '%PDF-';
  }

  if (mimetype === 'image/jpeg') {
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }

  if (mimetype === 'image/png') {
    return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimetype === 'image/webp') {
    return header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
  }

  return false;
};

const validateStoredFile = (file) => {
  if (!file || !file.path) {
    return 'No file uploaded.';
  }

  if (!Object.prototype.hasOwnProperty.call(ALLOWED_FILE_TYPES, file.mimetype)) {
    return 'Invalid file type. Only JPEG, PNG, WebP and PDF files are allowed.';
  }

  if (!getSafeExtension(file)) {
    return 'Invalid file extension for uploaded content type.';
  }

  const stats = fs.statSync(file.path);
  if (stats.size === 0) {
    return 'File is empty.';
  }

  if (stats.size > MAX_DOCUMENT_SIZE) {
    return 'File too large. Maximum size is 5MB.';
  }

  if (!hasExpectedSignature(file.path, file.mimetype)) {
    return 'File content does not match the declared file type.';
  }

  return null;
};

const cleanupUploadedFiles = (files) => {
  const flatFiles = Array.isArray(files)
    ? files
    : Object.values(files || {}).flatMap((fileArray) => Array.isArray(fileArray) ? fileArray : [fileArray]);

  flatFiles.forEach((file) => {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, documentsDir);
  },
  filename: (req, file, cb) => {
    const ext = getSafeExtension(file) || '.bin';
    const maidId = sanitizeSegment(req.user?.id, 'unknown');
    const documentType = sanitizeSegment(req.body?.type || file.fieldname, 'document');
    cb(null, `${maidId}_${documentType}_${crypto.randomUUID()}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (!Object.prototype.hasOwnProperty.call(ALLOWED_FILE_TYPES, file.mimetype)) {
    return cb(new Error('Invalid file type. Only JPEG, PNG, WebP and PDF files are allowed.'), false);
  }

  if (!getSafeExtension(file)) {
    return cb(new Error('Invalid file extension for uploaded content type.'), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
    files: 1,
    fields: 20,
    fieldSize: 16 * 1024,
    parts: 25
  }
});

const uploadMultiple = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
    files: 5,
    fields: 20,
    fieldSize: 16 * 1024,
    parts: 30
  }
});

const uploadSingle = upload.single('document');

const uploadVerificationDocuments = uploadMultiple.fields([
  { name: 'aadharCard', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'electricityBill', maxCount: 1 },
  { name: 'policeVerification', maxCount: 1 },
  { name: 'photo', maxCount: 1 }
]);

const handleMulterError = (err, multiple = false) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return multiple ? 'One or more files are too large. Maximum size is 5MB per file.' : 'File too large. Maximum size is 5MB.';
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return multiple ? 'Too many files uploaded.' : 'Too many files. Only one file is allowed.';
    }

    return 'Invalid upload request.';
  }

  return err?.message || 'Invalid upload request.';
};

const handleFileUpload = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: handleMulterError(err) });
    }

    const validationError = validateStoredFile(req.file);
    if (validationError) {
      cleanupUploadedFiles([req.file]);
      return res.status(400).json({ success: false, message: validationError });
    }

    next();
  });
};

const handleVerificationUpload = (req, res, next) => {
  uploadVerificationDocuments(req, res, (err) => {
    if (err) {
      cleanupUploadedFiles(req.files);
      return res.status(400).json({ success: false, message: handleMulterError(err, true) });
    }

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded.' });
    }

    for (const fileArray of Object.values(req.files)) {
      for (const file of fileArray) {
        const validationError = validateStoredFile(file);
        if (validationError) {
          cleanupUploadedFiles(req.files);
          return res.status(400).json({ success: false, message: validationError });
        }
      }
    }

    next();
  });
};

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

const getFileUrl = (filename) => {
  return `/uploads/documents/${path.basename(filename)}`;
};

const deleteLocalFile = (filename) => {
  const filePath = path.join(documentsDir, path.basename(filename));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
};

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
  validateStoredFile,
  getFileUrl,
  deleteFile: deleteLocalFile,
  getRequiredDocuments,
  uploadsDir,
  documentsDir,
  ALLOWED_FILE_TYPES,
  MAX_DOCUMENT_SIZE
};
