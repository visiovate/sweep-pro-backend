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
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter'),
  body('name')
    .trim()
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long'),
  body('phone')
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Please provide a valid phone number'),
  body('role')
    .isIn(['CUSTOMER', 'MAID', 'ADMIN'])
    .withMessage('Invalid role specified'),
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