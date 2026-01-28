const express = require('express');
const router = express.Router();
const TERMS_AND_CONDITIONS = require('../constants/termsAndConditions');

// Get Terms and Conditions
router.get('/', (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: TERMS_AND_CONDITIONS,
      message: 'Terms and Conditions retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching terms and conditions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch terms and conditions',
      error: error.message
    });
  }
});

module.exports = router;
