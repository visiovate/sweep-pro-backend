const express = require('express');
const router = express.Router();
const { submitPartnershipRequest } = require('../controllers/b2bController');
const { publicFormLimiter } = require('../middleware/rateLimiters');

// B2B Partnership Routes
router.post('/partnership', publicFormLimiter, submitPartnershipRequest);

module.exports = router;
