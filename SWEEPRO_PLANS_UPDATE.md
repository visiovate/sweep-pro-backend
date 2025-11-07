# SweepPro Touch & Lux Plans - Backend Updates

## Overview
Updated the subscription system to support two distinct plan types:
- **SweepPro Touch**: Premium silver plan without buffer system (₹4,050/month)
- **SweepPro Lux**: Ultimate luxury plan with 5-day buffer system (₹6,800/month)

## Changes Made

### 1. Database Schema Updates (`schema.prisma`)

#### Added PlanType Enum
```prisma
enum PlanType {
  TOUCH
  LUX
}
```

#### Updated ServicePlan Model
- Added `planType` field (TOUCH or LUX)
- Added `hasBufferSystem` boolean field
- Only LUX plans have buffer functionality
- TOUCH plans have `bufferDaysAllowed: 0` and `hasBufferSystem: false`

### 2. Seed Data Updates (`seed.js`)

#### New Active Plans Created
1. **SweepPro Touch Plan**
   - ID: `sweepro-touch-plan`
   - Price: ₹4,050/month (₹4,500 base - 10% discount)
   - Sessions: 30/month (daily)
   - Buffer: None (0 days)
   - Service: Daily Cleaning

2. **SweepPro Lux Plan**
   - ID: `sweepro-lux-plan`
   - Price: ₹6,800/month (₹8,000 base - 15% discount)
   - Sessions: 20/month (5 days/week)
   - Buffer: 5 days per month
   - Service: Deep Cleaning

#### Legacy Plans (Inactive)
- Basic Plan, Premium Plan, Standard Plan marked as inactive
- Kept for existing subscriptions only

#### Test Users Created
- `touch@sweepro.com` (password: touch123) - SweepPro Touch subscriber
- `lux@sweepro.com` (password: lux123) - SweepPro Lux subscriber

### 3. Subscription Controller Updates (`subscriptionController.js`)

#### `subscribeToPlan` Function
- Validates plan is active before allowing subscription
- Sets `bufferDaysCount` based on `plan.hasBufferSystem`
- TOUCH plans get 0 buffer days
- LUX plans get configured buffer days (5 days)

#### `startBufferPeriod` Function
- Checks if plan supports buffer system
- Returns error for TOUCH plans: "Your current plan (SweepPro Touch) does not support buffer system. Please upgrade to SweepPro Lux to access buffer functionality."
- Validates buffer days availability
- Returns remaining buffer days in response

#### `createSubscriptionPlan` & `updateSubscriptionPlan` Functions
- Added `planType`, `bufferDaysAllowed`, `hasBufferSystem` fields
- Validates buffer configuration (can't set buffer days without buffer system)
- Defaults to TOUCH plan type if not specified

### 4. Subscription Buffer Service Updates (`subscriptionBufferService.js`)

#### `startBufferPeriod` Function
- Added validation: `if (!subscription.plan.hasBufferSystem)`
- Throws error: "This plan does not support buffer system. Only SweepPro Lux plans have buffer functionality."
- Checks buffer days availability before creating buffer period

## API Changes

### New Response Fields

#### GET `/api/subscriptions/plans`
Plans now include:
```json
{
  "planType": "TOUCH" | "LUX",
  "hasBufferSystem": boolean,
  "bufferDaysAllowed": number
}
```

#### POST `/api/subscriptions/buffer/start`
Error responses for TOUCH plans:
```json
{
  "message": "Your current plan (SweepPro Touch) does not support buffer system...",
  "planType": "TOUCH",
  "upgradeRequired": true
}
```

Success response includes:
```json
{
  "success": true,
  "message": "Buffer period started successfully",
  "bufferPeriod": {...},
  "remainingBufferDays": number
}
```

## Migration Steps

### 1. Generate Prisma Migration
```bash
cd backend/sweep-pro-backend
npx prisma migrate dev --name add_plan_types_and_buffer_system
```

### 2. Run Seed Script
```bash
npx prisma db seed
```

### 3. Verify Database
```bash
npx prisma studio
```

Check:
- ServicePlan table has `planType` and `hasBufferSystem` columns
- Two new active plans exist: SweepPro Touch and SweepPro Lux
- Test users `touch@sweepro.com` and `lux@sweepro.com` exist

## Testing Checklist

### Plan Subscription
- [ ] Subscribe to SweepPro Touch plan
- [ ] Subscribe to SweepPro Lux plan
- [ ] Verify legacy plans are not available for new subscriptions
- [ ] Check buffer days are set correctly (0 for Touch, 5 for Lux)

### Buffer System
- [ ] Try to start buffer period with Touch plan (should fail)
- [ ] Start buffer period with Lux plan (should succeed)
- [ ] Verify buffer days decrement correctly
- [ ] Check error when all buffer days are used

### Admin Operations
- [ ] Create new plan with buffer system enabled
- [ ] Create new plan without buffer system
- [ ] Update plan to enable/disable buffer system
- [ ] Verify validation prevents buffer days without buffer system

### API Endpoints
- [ ] GET `/api/subscriptions/plans` - Returns new plan fields
- [ ] POST `/api/subscriptions/subscribe` - Creates subscription with correct buffer config
- [ ] POST `/api/subscriptions/buffer/start` - Validates plan type
- [ ] GET `/api/subscriptions/status` - Shows buffer availability

## Frontend Integration Notes

The frontend `PricingSection.tsx` already has the UI for Touch and Lux plans. Backend now supports:

1. **Plan Selection**: Users can subscribe to either plan
2. **Buffer Visibility**: Only show buffer options for Lux subscribers
3. **Upgrade Prompts**: Show upgrade message when Touch users try to access buffer
4. **Plan Comparison**: Display buffer system as a key differentiator

## Database Queries for Verification

```sql
-- Check new plans
SELECT id, name, planType, hasBufferSystem, bufferDaysAllowed, finalPrice, isActive 
FROM ServicePlan 
WHERE id IN ('sweepro-touch-plan', 'sweepro-lux-plan');

-- Check test subscriptions
SELECT s.id, u.email, sp.name, s.bufferDaysCount, s.bufferDaysUsed 
FROM Subscription s
JOIN CustomerProfile cp ON s.customerId = cp.id
JOIN User u ON cp.userId = u.id
JOIN ServicePlan sp ON s.planId = sp.id
WHERE u.email IN ('touch@sweepro.com', 'lux@sweepro.com');
```

## Rollback Plan

If issues occur:
1. Revert schema changes: `git checkout HEAD -- prisma/schema.prisma`
2. Revert seed changes: `git checkout HEAD -- prisma/seed.js`
3. Revert controller changes: `git checkout HEAD -- src/controllers/subscriptionController.js`
4. Revert service changes: `git checkout HEAD -- src/services/subscriptionBufferService.js`
5. Run: `npx prisma migrate reset`

## Summary

✅ **Completed:**
- Schema updated with PlanType enum and hasBufferSystem field
- Two new subscription plans created (Touch & Lux)
- Buffer system restricted to Lux plans only
- All API endpoints updated with proper validation
- Test users created for both plan types
- Legacy plans preserved but deactivated

🎯 **Key Differences:**
- **SweepPro Touch**: No buffer system, lower price point (₹4,050/month)
- **SweepPro Lux**: 5-day buffer system, premium pricing (₹6,800/month)

📝 **Next Steps:**
1. Run Prisma migration
2. Seed the database
3. Test all endpoints
4. Update frontend to handle buffer availability checks
