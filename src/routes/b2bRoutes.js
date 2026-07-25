const express = require('express');
const router = express.Router();
const { submitPartnershipRequest } = require('../controllers/b2bController');
const { publicFormLimiter } = require('../middleware/rateLimiters');

// B2B Services Routes
router.post('/services', publicFormLimiter, submitPartnershipRequest);

module.exports = router;
