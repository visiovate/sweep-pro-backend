const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    
    const errorMessages = errors.array().map(error => error.msg);
    return res.status(400).json({
      success: false,
      message: errorMessages[0], // Return first error message
      errors: errors.array()
    });
  }
  next();
};

// User registration validation rules
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters long')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  body('email')
    .trim()
    .custom((value) => {
      if (!value) throw new Error('Please provide a valid email address');
      if (/[^\x20-\x7E]/.test(value)) throw new Error('Email cannot contain emojis or non-standard characters');
      if (/[`\s]/.test(value)) throw new Error('Email contains invalid characters');
      if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
        throw new Error('Please provide a valid email address with a valid domain (e.g. user@example.com)');
      }
      return true;
    })
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email address is too long'),
  body('phone')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please provide a valid 10-digit Indian phone number starting with 6-9'),
  body('role')
    .isIn(['CUSTOMER', 'MAID'])
    .withMessage('Role must be either CUSTOMER or MAID'),
  body('password')
    .custom((value) => {
      if (!value) throw new Error('Password is required');
      if (/[^\x20-\x7E]/.test(value)) throw new Error('Password cannot contain emojis or non-standard characters');
      const len = Array.from(value).length;
      if (len < 8 || len > 128) throw new Error('Password must be between 8 and 128 characters long');
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{}|;:'",.<>\/~\`])[A-Za-z\d@$!%*?&#^()_+\-=\[\]{}|;:'",.<>\/~\`]{8,128}$/;
      if (!passwordRegex.test(value)) {
        throw new Error('Password must contain at least one lowercase letter, one uppercase letter, one digit, and one special character');
      }
      return true;
    }),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Password confirmation does not match password');
      }
      return true;
    }),
  body('address')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Address must be between 10 and 500 characters long')
    .matches(/^[a-zA-Z0-9\s,.'#()\/\-\:]+$/)
    .withMessage('Address contains invalid characters'),
  body('pincode')
    .custom((value, { req }) => {
      const role = req.body.role;
      const hasValue = typeof value !== 'undefined' && value !== null && String(value).trim() !== '';

      if (role === 'MAID' && !hasValue) {
        throw new Error('Pincode is required');
      }

      if (hasValue && !/^\d{6}$/.test(String(value).trim())) {
        throw new Error('Please provide a valid 6-digit pincode');
      }

      return true;
    }),
  validate
];

// User login validation rules
const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('rememberMe')
    .optional()
    .isBoolean()
    .withMessage('rememberMe must be a boolean'),
  validate
];

// Profile update validation rules
const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long'),
  body('phone')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Please provide a valid phone number'),
  body('address')
    .optional()
    .trim()
    .isLength({ min: 5 })
    .withMessage('Address must be at least 5 characters long'),
  body('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('pincode').optional().isLength({ min: 3, max: 20 }),
  body('locality').optional().isLength({ min: 2, max: 100 }),
  body('addressLine').optional().isLength({ min: 3, max: 200 }),
  body('city').optional().isLength({ min: 2, max: 100 }),
  body('state').optional().isLength({ min: 2, max: 100 }),
  body('landmark').optional().isLength({ min: 2, max: 200 }),
  validate
];

// User role update validation rules
const updateRoleValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid user ID'),
  body('role')
    .isIn(['CUSTOMER', 'MAID', 'ADMIN'])
    .withMessage('Invalid role specified'),
  validate
];

// User status update validation rules
const updateStatusValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid user ID'),
  body('status')
    .isIn(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED'])
    .withMessage('Invalid status specified'),
  validate
];

// User ID validation rules
const userIdValidation = [
  param('id')
    .isUUID()
    .withMessage('Invalid user ID'),
  validate
];

module.exports = {
  registerValidation,
  loginValidation,
  updateProfileValidation,
  updateRoleValidation,
  updateStatusValidation,
  userIdValidation
}; 