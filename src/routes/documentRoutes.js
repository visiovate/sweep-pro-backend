const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin, authorizeMaid } = require('../middleware/auth');
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

if (process.env.NODE_ENV !== 'production') {
  router.get('/test-upload', authenticateToken, authorizeAdmin, (req, res) => {
    res.json({
      success: true,
      message: 'Document upload endpoint is accessible',
      timestamp: new Date().toISOString()
    });
  });

  router.get('/test-verification', authenticateToken, authorizeAdmin, (req, res) => {
    res.json({
      success: true,
      message: 'Upload verification endpoint is accessible',
      timestamp: new Date().toISOString()
    });
  });
}

// Maid routes
router.post('/upload', authenticateToken, authorizeMaid, handleFileUpload, uploadDocument);
router.post('/upload-verification', authenticateToken, authorizeMaid, handleVerificationUpload, uploadMaidVerificationDocuments);
router.get('/my-documents', authenticateToken, authorizeMaid, getMaidDocuments);
router.get('/maid-verification-status', authenticateToken, authorizeMaid, getMaidVerificationStatus);
router.get('/required', getRequiredDocumentsList);
router.delete('/:documentId', authenticateToken, authorizeMaid, deleteDocument);

// Admin routes
router.get('/verification-stats', authenticateToken, authorizeAdmin, getVerificationStats);
router.get('/maids-status', authenticateToken, authorizeAdmin, getAllMaidsWithDocumentStatus);
router.get('/admin-verification-data', authenticateToken, authorizeAdmin, getMaidVerificationData);
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

