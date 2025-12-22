# Payment Validation API Documentation

## Endpoint: Validate Pricing

### URL
```
POST /subscriptions/validate-pricing
```

### Authentication
Not required (public endpoint)

### Request Body
```json
{
  "planId": "550e8400-e29b-41d4-a716-446655440000",
  "planDuration": "3month"
}
```

### Request Parameters

| Parameter | Type | Required | Description | Values |
|-----------|------|----------|-------------|--------|
| planId | string | Yes | UUID of the subscription plan | Valid plan UUID |
| planDuration | string | Yes | Selected subscription duration | "1month", "3month", "6month" |

### Response - Success (200 OK)

```json
{
  "success": true,
  "data": {
    "planId": "550e8400-e29b-41d4-a716-446655440000",
    "planName": "Sweepro Lux",
    "basePricePerPeriod": 2299,
    "selectedDuration": "3month",
    "durationMultiplier": 3,
    "totalBeforeDiscount": 6897,
    "discountPercent": 8,
    "discountAmount": 552,
    "subtotal": 6345,
    "gstPercent": 18,
    "gstAmount": 1142,
    "totalWithGst": 7487,
    "paymentAmount": 6345
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Request success status |
| data.planId | string | The plan UUID (echoed back) |
| data.planName | string | Human-readable plan name |
| data.basePricePerPeriod | number | Base price per month/period |
| data.selectedDuration | string | The selected duration |
| data.durationMultiplier | number | Multiplier applied (1, 3, or 6) |
| data.totalBeforeDiscount | number | Amount before duration discount |
| data.discountPercent | number | Discount percentage applied |
| data.discountAmount | number | Amount deducted as discount |
| data.subtotal | number | Amount before GST |
| data.gstPercent | number | GST percentage (always 18%) |
| data.gstAmount | number | GST amount in rupees |
| data.totalWithGst | number | Final amount including GST |
| data.paymentAmount | number | Amount to send to payment processor |

### Response - Error Cases

#### 400 Bad Request - Missing Plan ID
```json
{
  "success": false,
  "message": "Plan ID is required",
  "code": "MISSING_PLAN_ID"
}
```

#### 404 Not Found - Plan Not Found
```json
{
  "success": false,
  "message": "Plan not found",
  "code": "PLAN_NOT_FOUND"
}
```

#### 500 Server Error
```json
{
  "success": false,
  "message": "Failed to validate pricing",
  "error": "Detailed error message (if NODE_ENV is development)"
}
```

## Examples

### Example 1: Validate 3-Month Premium Plan
```bash
curl -X POST http://localhost:5000/subscriptions/validate-pricing \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "550e8400-e29b-41d4-a716-446655440000",
    "planDuration": "3month"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "planId": "550e8400-e29b-41d4-a716-446655440000",
    "planName": "Sweepro Lux",
    "basePricePerPeriod": 2299,
    "selectedDuration": "3month",
    "durationMultiplier": 3,
    "totalBeforeDiscount": 6897,
    "discountPercent": 8,
    "discountAmount": 552,
    "subtotal": 6345,
    "gstPercent": 18,
    "gstAmount": 1142,
    "totalWithGst": 7487,
    "paymentAmount": 6345
  }
}
```

### Example 2: Validate 1-Month Standard Plan
```bash
curl -X POST http://localhost:5000/subscriptions/validate-pricing \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "660e8400-e29b-41d4-a716-446655440001",
    "planDuration": "1month"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "planId": "660e8400-e29b-41d4-a716-446655440001",
    "planName": "Sweepro Touch",
    "basePricePerPeriod": 1299,
    "selectedDuration": "1month",
    "durationMultiplier": 1,
    "totalBeforeDiscount": 1299,
    "discountPercent": 0,
    "discountAmount": 0,
    "subtotal": 1299,
    "gstPercent": 18,
    "gstAmount": 234,
    "totalWithGst": 1533,
    "paymentAmount": 1299
  }
}
```

### Example 3: Validate 6-Month Standard Plan
```bash
curl -X POST http://localhost:5000/subscriptions/validate-pricing \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "660e8400-e29b-41d4-a716-446655440001",
    "planDuration": "6month"
  }'
```

Response:
```json
{
  "success": true,
  "data": {
    "planId": "660e8400-e29b-41d4-a716-446655440001",
    "planName": "Sweepro Touch",
    "basePricePerPeriod": 1299,
    "selectedDuration": "6month",
    "durationMultiplier": 6,
    "totalBeforeDiscount": 7794,
    "discountPercent": 15,
    "discountAmount": 1169,
    "subtotal": 6625,
    "gstPercent": 18,
    "gstAmount": 1193,
    "totalWithGst": 7818,
    "paymentAmount": 6625
  }
}
```

## Pricing Rules

### Duration Multipliers
| Duration | Multiplier | Discount | Effective Price |
|----------|-----------|----------|-----------------|
| 1 month | 1x | 0% | 1× base price |
| 3 months | 3x | 8% | 2.76× base price |
| 6 months | 6x | 15% | 5.1× base price |

### GST Calculation
- Always 18% of subtotal
- Applied AFTER duration discount
- Formula: `gstAmount = subtotal × 0.18`

### Example Calculation Breakdown
```
For 3-month Sweepro Lux plan:

Step 1: Apply duration multiplier
  Base Price: ₹2299
  Multiplier: 3
  Total: 2299 × 3 = ₹6897

Step 2: Apply duration discount
  Discount %: 8%
  Discount Amount: 6897 × 0.08 = ₹552
  Subtotal: 6897 - 552 = ₹6345

Step 3: Apply GST
  GST %: 18%
  GST Amount: 6345 × 0.18 = ₹1142.10 ≈ ₹1142
  Total with GST: 6345 + 1142 = ₹7487

Final Prices:
  - Subtotal (for payment processor): ₹6345
  - With GST (what customer sees): ₹7487
  - Send to Razorpay: Use totalWithGst (₹7487)
```

## Integration with Subscription Endpoint

The `/validate-pricing` endpoint should be called **before** creating a subscription to ensure pricing is correct:

### Recommended Flow
```
1. User selects plan and duration
2. Call POST /subscriptions/validate-pricing
   - Input: planId, planDuration
   - Output: totalWithGst, paymentAmount

3. Display pricing breakdown to user
   - basePricePerPeriod
   - totalBeforeDiscount
   - discountAmount
   - subtotal
   - gstAmount
   - totalWithGst

4. If user confirms, create Razorpay order with totalWithGst
5. After payment, call POST /subscriptions/subscribe
   - The subscription will store the backend-calculated amount
```

## Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| MISSING_PLAN_ID | 400 | Plan ID was not provided |
| PLAN_NOT_FOUND | 404 | Plan with given ID doesn't exist |
| UNKNOWN_ERROR | 500 | Server error during validation |

## Rate Limits

No rate limiting on this endpoint (public).

## Caching

Response can be cached by client for short periods (1 minute) since prices change infrequently.

## Notes

- This endpoint is **public** and requires no authentication
- Use `totalWithGst` for displaying to customers
- Use `paymentAmount` for sending to payment processors
- Duration must be one of: "1month", "3month", "6month"
- All amounts are in Indian Rupees (₹)

