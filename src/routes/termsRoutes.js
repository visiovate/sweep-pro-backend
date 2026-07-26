const express = require('express');
const router = express.Router();
const { CUSTOMER_TERMS, WORKER_TERMS } = require('../constants/termsAndConditions');

// Get Terms and Conditions by type
router.get('/', (req, res) => {
  try {
    const { type } = req.query;
    
    if (!type || (type !== 'customer' && type !== 'worker')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing type parameter. Must be "customer" or "worker"'
      });
    }
    
    const terms = type === 'customer' ? CUSTOMER_TERMS : WORKER_TERMS;
    
    // Set effective date to current date when terms are requested (when user accepts)
    const currentDate = new Date();
    const formattedDate = currentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    // Create a copy of terms with dynamic dates
    const termsWithDates = {
      ...terms,
      effectiveDate: formattedDate,
      lastUpdated: formattedDate
    };
    
    res.status(200).json({
      success: true,
      data: termsWithDates,
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
