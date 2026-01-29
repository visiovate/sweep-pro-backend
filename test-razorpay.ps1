# Razorpay Payment API Test Script (Windows PowerShell)
# This script tests the Razorpay subscription payment order creation endpoint

param(
    [Parameter(Mandatory=$false)]
    [string]$JwtToken,
    
    [Parameter(Mandatory=$false)]
    [string]$SubscriptionId,
    
    [Parameter(Mandatory=$false)]
    [int]$Amount = 99999,
    
    [Parameter(Mandatory=$false)]
    [string]$Currency = "INR"
)

# Configuration
$BackendUrl = "http://localhost:3000"

# Color functions
function Write-Header {
    param([string]$Text)
    Write-Host "`n╔════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  $Text" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════╝`n" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host "✅ $Text" -ForegroundColor Green
}

function Write-Error-Custom {
    param([string]$Text)
    Write-Host "❌ $Text" -ForegroundColor Red
}

function Write-Warning-Custom {
    param([string]$Text)
    Write-Host "⚠️  $Text" -ForegroundColor Yellow
}

# Main Script
Clear-Host
Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Sweep Pro - Razorpay Payment API Tester  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Validate inputs
if ([string]::IsNullOrEmpty($JwtToken)) {
    Write-Error-Custom "JWT_TOKEN not provided"
    Write-Host ""
    Write-Host "Usage: .\test-razorpay.ps1 -JwtToken <TOKEN> -SubscriptionId <ID> [-Amount <AMOUNT>] [-Currency <CURRENCY>]"
    Write-Host ""
    Write-Host "Example:"
    Write-Host "  .\test-razorpay.ps1 -JwtToken 'eyJhbGc...' -SubscriptionId 'sub-123abc' -Amount 99999 -Currency INR"
    exit 1
}

if ([string]::IsNullOrEmpty($SubscriptionId)) {
    Write-Error-Custom "SUBSCRIPTION_ID not provided"
    Write-Host ""
    Write-Host "Usage: .\test-razorpay.ps1 -JwtToken <TOKEN> -SubscriptionId <ID>"
    exit 1
}

# Step 1: Health Check
Write-Header "Step 1: Checking Backend Health"
try {
    $healthResponse = Invoke-WebRequest -Uri "$BackendUrl/api/auth/me" `
        -Headers @{ "Authorization" = "Bearer $JwtToken" } `
        -ErrorAction SilentlyContinue
    Write-Success "Backend is running at $BackendUrl"
} catch {
    Write-Error-Custom "Backend not responding. Is it running on port 3000?"
    exit 1
}

# Step 2: Test Create Order Endpoint
Write-Header "Step 2: Testing Create Razorpay Order"
Write-Warning-Custom "Testing with:"
Write-Host "  - Subscription ID: $SubscriptionId"
Write-Host "  - Amount: $Amount (paise)"
Write-Host "  - Currency: $Currency"
Write-Host ""

$RequestBody = @{
    subscriptionId = $SubscriptionId
    amount = $Amount
    currency = $Currency
} | ConvertTo-Json

try {
    $Response = Invoke-WebRequest -Uri "$BackendUrl/api/payments/razorpay/subscription/create-order" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "Authorization" = "Bearer $JwtToken"
        } `
        -Body $RequestBody `
        -ErrorAction Stop
    
    $HttpCode = $Response.StatusCode
    $ResponseBody = $Response.Content | ConvertFrom-Json
    
    Write-Host "Response Code: $HttpCode`n" -ForegroundColor Green
    Write-Host "Response Body:" -ForegroundColor Cyan
    Write-Host ($ResponseBody | ConvertTo-Json -Depth 10)
    
} catch {
    $Response = $_.Exception.Response
    $HttpCode = $Response.StatusCode.Value__
    $ResponseBody = $_.Exception.Response.Content.ReadAsStringAsync().Result
    
    Write-Host "Response Code: $HttpCode`n" -ForegroundColor Red
    Write-Host "Response Body:" -ForegroundColor Cyan
    
    try {
        Write-Host ($ResponseBody | ConvertFrom-Json | ConvertTo-Json -Depth 10)
    } catch {
        Write-Host $ResponseBody
    }
}

# Step 3: Analyze Response
Write-Header "Step 3: Response Analysis"

if ($HttpCode -eq 201) {
    Write-Success "Order created successfully! (HTTP 201)"
    
    try {
        $ResponseObj = $ResponseBody | ConvertFrom-Json
        $OrderId = $ResponseObj.order.id
        $Key = $ResponseObj.key
        
        Write-Host ""
        Write-Success "Order ID: $OrderId"
        Write-Success "Razorpay Key: $Key"
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Open Razorpay checkout with order details"
        Write-Host "  2. Complete payment in checkout modal"
        Write-Host "  3. Verify payment using verify endpoint"
    } catch {
        Write-Host "Could not parse response details"
    }
} elseif ($HttpCode -eq 400) {
    Write-Error-Custom "Bad Request (HTTP 400)"
    Write-Host "Possible issues:"
    Write-Host "  - Invalid subscriptionId format"
    Write-Host "  - Invalid amount value"
    Write-Host "  - Missing required fields"
} elseif ($HttpCode -eq 401) {
    Write-Error-Custom "Unauthorized (HTTP 401)"
    Write-Host "Possible issues:"
    Write-Host "  - JWT token is invalid or expired"
    Write-Host "  - Authorization header not provided"
} elseif ($HttpCode -eq 404) {
    Write-Error-Custom "Not Found (HTTP 404)"
    Write-Host "Possible issues:"
    Write-Host "  - Subscription not found"
    Write-Host "  - Invalid subscriptionId"
} elseif ($HttpCode -eq 409) {
    Write-Error-Custom "Conflict (HTTP 409)"
    Write-Host "Possible issues:"
    Write-Host "  - Subscription is not in PENDING_PAYMENT status"
    Write-Host "  - Subscription already has an active payment"
} elseif ($HttpCode -eq 500) {
    Write-Error-Custom "Internal Server Error (HTTP 500)"
    Write-Host "Check backend logs for detailed error message"
    Write-Host "Response details above"
} else {
    Write-Error-Custom "Unexpected response code: $HttpCode"
}

Write-Header "Test Complete"
Write-Host "For more details, check:"
Write-Host "  - Backend console output"
Write-Host "  - POSTMAN_TESTING_GUIDE.md"
Write-Host "  - Postman collection: Sweep-Pro-Razorpay-Tests.postman_collection.json"
