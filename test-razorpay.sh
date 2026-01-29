#!/bin/bash
# Razorpay Payment API Test Script
# This script tests the Razorpay subscription payment order creation endpoint

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:3000"
JWT_TOKEN="${1:-}"
SUBSCRIPTION_ID="${2:-}"
AMOUNT="${3:-99999}"
CURRENCY="${4:-INR}"

# Functions
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Main Testing
clear
echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Sweep Pro - Razorpay Payment API Tester  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"

# Validate inputs
if [ -z "$JWT_TOKEN" ]; then
    print_error "JWT_TOKEN not provided"
    echo ""
    echo "Usage: bash test-razorpay.sh <JWT_TOKEN> <SUBSCRIPTION_ID> [AMOUNT] [CURRENCY]"
    echo ""
    echo "Example:"
    echo "  bash test-razorpay.sh 'eyJhbGc...' 'sub-123abc' 99999 INR"
    exit 1
fi

if [ -z "$SUBSCRIPTION_ID" ]; then
    print_error "SUBSCRIPTION_ID not provided"
    echo ""
    echo "Usage: bash test-razorpay.sh <JWT_TOKEN> <SUBSCRIPTION_ID> [AMOUNT] [CURRENCY]"
    exit 1
fi

# Step 1: Health Check
print_header "Step 1: Checking Backend Health"
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/auth/me" \
  -H "Authorization: Bearer $JWT_TOKEN")

if [ "$HEALTH_RESPONSE" = "200" ] || [ "$HEALTH_RESPONSE" = "401" ]; then
    print_success "Backend is running at $BACKEND_URL"
else
    print_error "Backend not responding. Is it running on port 3000?"
    exit 1
fi

# Step 2: Test Create Order Endpoint
print_header "Step 2: Testing Create Razorpay Order"
print_warning "Testing with:"
echo "  - Subscription ID: $SUBSCRIPTION_ID"
echo "  - Amount: $AMOUNT (paise)"
echo "  - Currency: $CURRENCY"
echo ""

RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/payments/razorpay/subscription/create-order" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"subscriptionId\": \"$SUBSCRIPTION_ID\",
    \"amount\": $AMOUNT,
    \"currency\": \"$CURRENCY\"
  }")

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/api/payments/razorpay/subscription/create-order" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"subscriptionId\": \"$SUBSCRIPTION_ID\",
    \"amount\": $AMOUNT,
    \"currency\": \"$CURRENCY\"
  }")

echo "Response Code: $HTTP_CODE"
echo ""
echo "Response Body:"
echo "$RESPONSE" | python -m json.tool 2>/dev/null || echo "$RESPONSE"

# Analyze Response
print_header "Step 3: Response Analysis"

if [ "$HTTP_CODE" = "201" ]; then
    print_success "Order created successfully! (HTTP 201)"
    
    # Extract order ID
    ORDER_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    KEY=$(echo "$RESPONSE" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)
    
    if [ ! -z "$ORDER_ID" ]; then
        echo ""
        print_success "Order ID: $ORDER_ID"
        print_success "Razorpay Key: $KEY"
        echo ""
        echo "Next steps:"
        echo "  1. Open Razorpay checkout with order details"
        echo "  2. Complete payment in checkout modal"
        echo "  3. Verify payment using verify endpoint"
    fi
elif [ "$HTTP_CODE" = "400" ]; then
    print_error "Bad Request (HTTP 400)"
    echo "Possible issues:"
    echo "  - Invalid subscriptionId format"
    echo "  - Invalid amount value"
    echo "  - Missing required fields"
elif [ "$HTTP_CODE" = "401" ]; then
    print_error "Unauthorized (HTTP 401)"
    echo "Possible issues:"
    echo "  - JWT token is invalid or expired"
    echo "  - Authorization header not provided"
elif [ "$HTTP_CODE" = "404" ]; then
    print_error "Not Found (HTTP 404)"
    echo "Possible issues:"
    echo "  - Subscription not found"
    echo "  - Invalid subscriptionId"
elif [ "$HTTP_CODE" = "409" ]; then
    print_error "Conflict (HTTP 409)"
    echo "Possible issues:"
    echo "  - Subscription is not in PENDING_PAYMENT status"
    echo "  - Subscription already has an active payment"
elif [ "$HTTP_CODE" = "500" ]; then
    print_error "Internal Server Error (HTTP 500)"
    echo "Check backend logs for detailed error message"
    echo "Response details:"
    if echo "$RESPONSE" | grep -q "details"; then
        echo "$RESPONSE" | grep -o '"details":"[^"]*"'
    fi
else
    print_error "Unexpected response code: $HTTP_CODE"
fi

print_header "Test Complete"
echo "For more details, check:"
echo "  - Backend console output"
echo "  - POSTMAN_TESTING_GUIDE.md"
echo "  - Postman collection: Sweep-Pro-Razorpay-Tests.postman_collection.json"
