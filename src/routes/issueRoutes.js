const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const {
  createIssue,
  getAllIssues,
  getIssueById,
  updateIssueStatus,
  getUserIssues
} = require('../controllers/issueController');

// Customer routes
router.post('/', authenticateToken, createIssue);
router.get('/my-issues', authenticateToken, getUserIssues);

// Admin routes
router.get('/', authenticateToken, authorizeAdmin, getAllIssues);
router.get('/:id', authenticateToken, authorizeAdmin, getIssueById);
router.put('/:id/status', authenticateToken, authorizeAdmin, updateIssueStatus);

module.exports = router; 