const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const { handleFileUpload, handleVerificationUpload } = require('../utils/fileUpload');
const {
  uploadDocument,
  getMaidDocuments,
  getDocumentsForReview,
  verifyDocument,
  deleteDocument,
  getAllMaidsWithDocumentStatus,
  getRequiredDocumentsList,
  getDocumentById,
  getVerificationStats,
  uploadMaidVerificationDocuments,
  getMaidVerificationData,
  downloadDocument,
  approveVerification,
  rejectVerification,
  getMaidVerificationStatus
} = require('../controllers/documentController');

// Public route to get required documents list
router.get('/required', getRequiredDocumentsList);

// Debug endpoint to test connectivity
router.get('/test-upload', (req, res) => {
  res.json({
    success: true,
    message: 'Document upload endpoint is accessible',
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint for upload verification endpoint
router.get('/test-verification', (req, res) => {
  res.json({
    success: true,
    message: 'Upload verification endpoint is accessible',
    timestamp: new Date().toISOString()
  });
});

// Maid routes
router.post('/upload', authenticateToken, handleFileUpload, uploadDocument);
router.post('/upload-verification', authenticateToken, handleVerificationUpload, uploadMaidVerificationDocuments);
router.get('/my-documents', authenticateToken, getMaidDocuments);
router.get('/verification-status', authenticateToken, getMaidVerificationStatus);
router.delete('/:documentId', authenticateToken, deleteDocument);

// Admin routes
router.get('/verification-stats', authenticateToken, authorizeAdmin, getVerificationStats);
router.get('/maids-status', authenticateToken, authorizeAdmin, getAllMaidsWithDocumentStatus);
router.get('/admin-verification-data', authenticateToken, authorizeAdmin, getMaidVerificationData);
router.get('/verification/admin', authenticateToken, authorizeAdmin, getMaidVerificationData);
router.get('/review/:maidId', authenticateToken, authorizeAdmin, getDocumentsForReview);
router.patch('/verify/:documentId', authenticateToken, authorizeAdmin, verifyDocument);
router.post('/verification/:verificationId/approve', authenticateToken, authorizeAdmin, approveVerification);
router.post('/verification/:verificationId/reject', authenticateToken, authorizeAdmin, rejectVerification);
router.post('/approve/:verificationId', authenticateToken, authorizeAdmin, approveVerification);
router.post('/reject/:verificationId', authenticateToken, authorizeAdmin, rejectVerification);
router.get('/download/:documentId', authenticateToken, downloadDocument);

// Document viewing route (both maid and admin)
router.get('/:documentId', authenticateToken, getDocumentById);

module.exports = router;
