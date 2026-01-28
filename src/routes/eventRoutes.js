const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const eventController = require('../controllers/eventController');

const router = express.Router();

router.post('/pricing-visited', authenticateToken, eventController.pricingVisited);

module.exports = router;
