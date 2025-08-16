const { body, param, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
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
    .isEmail()
    .withMessage('Please provide a valid email address')
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
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&].*$/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one digit, and one special character'),
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
    .matches(/^[a-zA-Z0-9\s,.-]+$/)
    .withMessage('Address contains invalid characters'),
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