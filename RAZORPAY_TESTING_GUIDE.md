# 🔧 Razorpay Integration Testing Guide

## 🚀 Prerequisites

### 1. Environment Setup
Ensure your `.env` file contains:
```bash
RAZORPAY_TEST_KEY_ID=rzp_test_xxxxxxxxx
RAZORPAY_TEST_KEY_SECRET=xxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
JWT_SECRET=your_jwt_secret
DATABASE_URL=your_database_url
NODE_ENV=development
```

### 2. Database Setup
```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### 3. Start Server
```bash
npm run dev
```

## 📋 Method 1: Postman Testing (Recommended)

### Step 1: Import Collection
1. Open Postman
2. Import the `postman-razorpay-tests.json` file
3. Create a new environment with these variables:
   - `base_url`: `http://localhost:3000`
   - `RAZORPAY_TEST_KEY_ID`: Your test key ID
   - `RAZORPAY_TEST_KEY_SECRET`: Your test key secret

### Step 2: Setup Test Data
**POST** `/api/test/setup-test-data`
```json
{
  "success": true,
  "testService": {
    "id": "service_id_here",
    "name": "Test Cleaning Service",
    "basePrice": 500
  },
  "testCustomer": {
    "id": "customer_id_here",
    "email": "customer@sweepro.com"
  }
}
```

### Step 3: Authentication
**POST** `/api/auth/login`
```json
{
  "email": "customer@sweepro.com",
  "password": "customer123"
}
```

### Step 4: Create Test Booking
**POST** `/api/test/create-test-booking`
```json
{
  "customerId": "{{customer_id}}",
  "serviceId": "{{service_id}}"
}
```

### Step 5: Create Razorpay Order
**POST** `/api/payments/razorpay/booking/create-order`
```json
{
  "bookingId": "{{booking_id}}",
  "amount": 500,
  "currency": "INR"
}
```

### Step 6: Generate Test Signature
**POST** `/api/test/generate-signature`
```json
{
  "orderId": "{{razorpay_order_id}}",
  "paymentId": "pay_test_12345"
}
```

### Step 7: Verify Payment
**POST** `/api/payments/razorpay/verify`
```json
{
  "razorpay_order_id": "{{razorpay_order_id}}",
  "razorpay_payment_id": "pay_test_12345",
  "razorpay_signature": "{{generated_signature}}",
  "payment_method": "card"
}
```

## 🌐 Method 2: Frontend Integration Testing

### Step 1: Create Test HTML File
Create `test-payment.html` in your project root:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Razorpay Test Integration</title>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
    <h1>Sweep Pro - Payment Test</h1>
    <button id="payButton">Pay Now</button>
    
    <script>
        const API_BASE = 'http://localhost:3000/api';
        let authToken = '';
        
        // Login first
        async function login() {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'customer@sweepro.com',
                    password: 'customer123'
                })
            });
            const data = await response.json();
            authToken = data.token;
            return data;
        }
        
        // Create booking
        async function createBooking(serviceId) {
            const response = await fetch(`${API_BASE}/bookings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    serviceId: serviceId,
                    scheduledDate: '2025-07-15',
                    scheduledTime: '10:00',
                    address: '123 Test Street, Test City',
                    notes: 'Test booking'
                })
            });
            return await response.json();
        }
        
        // Create Razorpay order
        async function createRazorpayOrder(bookingId, amount) {
            const response = await fetch(`${API_BASE}/payments/razorpay/booking/create-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    bookingId: bookingId,
                    amount: amount,
                    currency: 'INR'
                })
            });
            return await response.json();
        }
        
        // Verify payment
        async function verifyPayment(paymentData) {
            const response = await fetch(`${API_BASE}/payments/razorpay/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify(paymentData)
            });
            return await response.json();
        }
        
        // Main payment flow
        document.getElementById('payButton').addEventListener('click', async () => {
            try {
                // Step 1: Login
                const loginData = await login();
                console.log('Logged in:', loginData);
                
                // Step 2: Get test data
                const testDataResponse = await fetch(`${API_BASE}/test/setup-test-data`, {
                    method: 'POST'
                });
                const testData = await testDataResponse.json();
                console.log('Test data:', testData);
                
                // Step 3: Create booking
                const bookingData = await createBooking(testData.testService.id);
                console.log('Booking created:', bookingData);
                
                // Step 4: Create Razorpay order
                const orderData = await createRazorpayOrder(
                    bookingData.data.booking.id,
                    bookingData.data.booking.finalAmount
                );
                console.log('Razorpay order:', orderData);
                
                // Step 5: Initialize Razorpay checkout
                const options = {
                    key: orderData.key,
                    amount: orderData.order.amount,
                    currency: orderData.order.currency,
                    order_id: orderData.order.id,
                    name: 'Sweep Pro',
                    description: 'Professional Cleaning Services',
                    handler: async function(response) {
                        console.log('Payment response:', response);
                        
                        // Verify payment
                        const verifyData = await verifyPayment({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            payment_method: 'card'
                        });
                        
                        console.log('Payment verified:', verifyData);
                        alert('Payment successful!');
                    },
                    prefill: {
                        name: 'Test Customer',
                        email: 'customer@sweepro.com',
                        contact: '9999999999'
                    },
                    theme: {
                        color: '#3399cc'
                    }
                };
                
                const rzp = new Razorpay(options);
                rzp.open();
                
            } catch (error) {
                console.error('Payment error:', error);
                alert('Payment failed: ' + error.message);
            }
        });
    </script>
</body>
</html>
```

### Step 2: Test the Integration
1. Open `test-payment.html` in your browser
2. Click "Pay Now"
3. Use Razorpay test cards:
   - **Success**: `4111111111111111`
   - **Failure**: `4000000000000002`

## 🔍 Testing Scenarios

### 1. Successful Payment Flow
- Create order → Process payment → Verify signature → Update booking

### 2. Payment Failure Flow
- Create order → Payment fails → Handle failure → Update status

### 3. Webhook Testing
```bash
# Use ngrok to expose local server
ngrok http 3000

# Set webhook URL in Razorpay dashboard:
# https://your-ngrok-url.com/api/payments/razorpay/webhook
```

### 4. Refund Testing
```bash
# Login as admin
POST /api/auth/login
{
  "email": "admin@sweepro.com",
  "password": "admin123"
}

# Process refund
POST /api/payments/{payment_id}/refund
{
  "refundAmount": 100,
  "refundReason": "Customer requested refund"
}
```

## 📊 Test Cases Checklist

### Basic Payment Flow
- [ ] Create Razorpay order
- [ ] Successful payment verification
- [ ] Payment failure handling
- [ ] Booking status update after payment

### Edge Cases
- [ ] Invalid signature verification
- [ ] Duplicate payment attempts
- [ ] Expired order handling
- [ ] Network timeout scenarios

### Admin Operations
- [ ] Full refund processing
- [ ] Partial refund processing
- [ ] Payment status updates
- [ ] Webhook event handling

### Security Tests
- [ ] Signature validation
- [ ] Unauthorized access prevention
- [ ] Rate limiting (if implemented)
- [ ] Input validation

## 🐛 Common Issues & Solutions

### 1. Invalid Signature Error
**Cause**: Incorrect key secret or signature generation
**Solution**: Check environment variables and signature generation logic

### 2. Order Not Found
**Cause**: Order ID mismatch
**Solution**: Verify order creation and ID storage

### 3. Payment Already Processed
**Cause**: Duplicate payment attempts
**Solution**: Check existing payment records

### 4. Webhook Not Receiving Events
**Cause**: Incorrect webhook URL or firewall issues
**Solution**: Use ngrok for local testing, verify webhook URL

## 📈 Production Checklist

- [ ] Replace test keys with live keys
- [ ] Set up production webhook URLs
- [ ] Implement proper error logging
- [ ] Add rate limiting
- [ ] Set up monitoring and alerts
- [ ] Test with real payment methods
- [ ] Implement automatic reconciliation

## 🔗 Useful Links

- [Razorpay Test Cards](https://razorpay.com/docs/payments/payments/test-card-numbers/)
- [Razorpay Webhook Events](https://razorpay.com/docs/webhooks/supported-events/)
- [Razorpay JavaScript Integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/)

---

**Happy Testing! 🚀**
