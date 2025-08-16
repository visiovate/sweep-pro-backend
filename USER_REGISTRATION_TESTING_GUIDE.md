# 👥 User Registration Testing Guide

## 🚀 Overview

This guide provides comprehensive testing instructions for the enhanced user registration system that supports both **CUSTOMER** and **MAID** role registrations with proper validation and profile creation.

## 📋 Registration API Details

### Endpoint
```
POST /api/auth/register
```

### Request Body Format
```json
{
  "name": "string (2-100 characters, letters and spaces only)",
  "email": "string (valid email format)",
  "phone": "string (10-digit Indian phone number starting with 6-9)",
  "role": "string (CUSTOMER or MAID)",
  "password": "string (8+ chars, must include uppercase, lowercase, digit, special char)",
  "confirmPassword": "string (must match password)",
  "address": "string (10-500 characters, alphanumeric with basic punctuation)"
}
```

### Response Format (Success)
```json
{
  "success": true,
  "message": "Customer/Maid registered successfully",
  "data": {
    "user": {
      "id": "uuid",
      "name": "string",
      "email": "string",
      "phone": "string",
      "address": "string",
      "role": "CUSTOMER|MAID",
      "status": "ACTIVE",
      "createdAt": "datetime"
    },
    "token": "jwt-token"
  }
}
```

## 🧪 Testing Methods

### Method 1: Generate Test Data (Recommended)
```bash
# Get pre-generated test users
GET http://localhost:3000/api/test/generate-test-users
```

This returns ready-to-use test data for both customers and maids.

### Method 2: Manual Testing Data

#### Test Customer Registration
```json
{
  "name": "John Smith",
  "email": "john.customer@test.com",
  "phone": "9876543210",
  "role": "CUSTOMER",
  "password": "TestPass123!",
  "confirmPassword": "TestPass123!",
  "address": "123 Test Street, Test City, Test State - 123456"
}
```

#### Test Maid Registration
```json
{
  "name": "Mary Rodriguez",
  "email": "mary.maid@test.com",
  "phone": "8765432109",
  "role": "MAID",
  "password": "TestPass123!",
  "confirmPassword": "TestPass123!",
  "address": "321 Worker Lane, Service City, Service State - 321654"
}
```

## 📋 Complete Test Suite

### Step 1: Start the Server
```bash
cd backend
npm run dev
```

### Step 2: Get Test Data
```bash
curl -X GET http://localhost:3000/api/test/generate-test-users
```

### Step 3: Test Customer Registration
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "email": "john.customer@test.com",
    "phone": "9876543210",
    "role": "CUSTOMER",
    "password": "TestPass123!",
    "confirmPassword": "TestPass123!",
    "address": "123 Test Street, Test City, Test State - 123456"
  }'
```

### Step 4: Test Maid Registration
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mary Rodriguez",
    "email": "mary.maid@test.com",
    "phone": "8765432109",
    "role": "MAID",
    "password": "TestPass123!",
    "confirmPassword": "TestPass123!",
    "address": "321 Worker Lane, Service City, Service State - 321654"
  }'
```

### Step 5: Test Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.customer@test.com",
    "password": "TestPass123!"
  }'
```

## 🔍 Validation Testing

### Test Invalid Data
```bash
# Test validation endpoint
curl -X POST http://localhost:3000/api/test/validate-registration-data \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jo",
    "email": "invalid-email",
    "phone": "123",
    "role": "INVALID",
    "password": "weak",
    "confirmPassword": "different",
    "address": "short"
  }'
```

### Expected Validation Errors
- **Name**: Must be 2-100 characters, letters and spaces only
- **Email**: Must be valid email format
- **Phone**: Must be 10-digit Indian number starting with 6-9
- **Role**: Must be CUSTOMER or MAID
- **Password**: Must be 8+ chars with uppercase, lowercase, digit, special character
- **Confirm Password**: Must match password
- **Address**: Must be 10-500 characters with valid characters

## 🎯 Testing Scenarios

### ✅ Positive Test Cases

1. **Valid Customer Registration**
   - All fields properly formatted
   - Unique email and phone
   - Strong password with confirmation

2. **Valid Maid Registration**
   - All fields properly formatted
   - Unique email and phone
   - Strong password with confirmation

3. **Successful Login**
   - Valid credentials
   - Active user status

### ❌ Negative Test Cases

1. **Duplicate Email**
   ```json
   {
     "success": false,
     "message": "User with this email already exists",
     "field": "email"
   }
   ```

2. **Duplicate Phone**
   ```json
   {
     "success": false,
     "message": "User with this phone number already exists",
     "field": "phone"
   }
   ```

3. **Password Mismatch**
   ```json
   {
     "errors": [
       {
         "msg": "Password confirmation does not match password",
         "param": "confirmPassword"
       }
     ]
   }
   ```

4. **Invalid Phone Format**
   ```json
   {
     "errors": [
       {
         "msg": "Please provide a valid 10-digit Indian phone number starting with 6-9",
         "param": "phone"
       }
     ]
   }
   ```

## 🧹 Database Profile Creation

### Customer Registration Creates:
1. **User Record** with basic information
2. **CustomerProfile** with:
   - Empty preferences object
   - Null emergency contact
   - Null special instructions

### Maid Registration Creates:
1. **User Record** with basic information
2. **MaidProfile** with:
   - Default availability schedule (Mon-Fri 9-6, Sat 9-4, Sun off)
   - English language by default
   - Empty skills array
   - PENDING_VERIFICATION status
   - Default service parameters (3 max bookings, 2km radius)
   - Performance tracking fields initialized to 0
   - 15% commission rate

## 🧪 Postman Testing Collection

### Import Settings
```json
{
  "name": "Sweep Pro Registration Tests",
  "requests": [
    {
      "name": "Generate Test Users",
      "method": "GET",
      "url": "{{base_url}}/api/test/generate-test-users"
    },
    {
      "name": "Register Customer",
      "method": "POST",
      "url": "{{base_url}}/api/auth/register",
      "body": "{{customer_registration_data}}"
    },
    {
      "name": "Register Maid",
      "method": "POST",
      "url": "{{base_url}}/api/auth/register",
      "body": "{{maid_registration_data}}"
    },
    {
      "name": "Login Test",
      "method": "POST",
      "url": "{{base_url}}/api/auth/login",
      "body": "{{login_data}}"
    },
    {
      "name": "Validate Registration Data",
      "method": "POST",
      "url": "{{base_url}}/api/test/validate-registration-data",
      "body": "{{validation_test_data}}"
    }
  ]
}
```

### Environment Variables
```json
{
  "base_url": "http://localhost:3000",
  "customer_registration_data": {
    "name": "John Smith",
    "email": "john.customer@test.com",
    "phone": "9876543210",
    "role": "CUSTOMER",
    "password": "TestPass123!",
    "confirmPassword": "TestPass123!",
    "address": "123 Test Street, Test City, Test State - 123456"
  }
}
```

## 🔧 Cleanup and Reset

### Cleanup Test Users
```bash
# Remove all test users
curl -X DELETE http://localhost:3000/api/test/cleanup-test-users
```

### Reset Database (if needed)
```bash
npm run prisma:migrate:reset
npm run prisma:seed
```

## 📊 Testing Checklist

### Registration Flow
- [ ] Customer registration with valid data
- [ ] Maid registration with valid data
- [ ] Duplicate email rejection
- [ ] Duplicate phone rejection
- [ ] Password validation
- [ ] Password confirmation validation
- [ ] Email format validation
- [ ] Phone format validation
- [ ] Name validation
- [ ] Address validation
- [ ] Role validation

### Profile Creation
- [ ] Customer profile created automatically
- [ ] Maid profile created automatically
- [ ] Default values set correctly
- [ ] Database relationships established

### Authentication
- [ ] JWT token generation
- [ ] Token includes correct user data
- [ ] Login with registered credentials
- [ ] Login returns user profiles

### Error Handling
- [ ] Validation errors returned properly
- [ ] Database constraint errors handled
- [ ] Network errors handled gracefully
- [ ] Clear error messages provided

## 🚀 Production Considerations

### Security
- Passwords are hashed with bcrypt (12 rounds)
- JWT tokens expire in 24 hours
- Validation prevents SQL injection
- Input sanitization applied

### Performance
- Database indexes on email and phone
- Transaction-based profile creation
- Efficient error handling
- Minimal database queries

### Monitoring
- Registration events logged
- Admin notifications sent
- Error tracking implemented
- Audit trail maintained

---

## 🤝 Support

For issues or questions:
1. Check server logs for detailed error messages
2. Verify database connection
3. Ensure all environment variables are set
4. Test with the provided test data first

**Happy Testing! 🎉**
