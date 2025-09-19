# Monthly Subscription System with Buffer Periods

## Overview

The Sweepro backend has been upgraded from a daily service confirmation system to a comprehensive monthly subscription system with automatic buffer periods. This system provides:

- **Monthly Subscription Cycles**: Automatic monthly service scheduling
- **Buffer Periods**: 3-day pause periods at the end of each month
- **Automatic Maid Assignment**: Smart maid scheduling with buffer period awareness
- **Comprehensive Analytics**: Detailed subscription and service analytics
- **User Dashboard**: Complete subscription management interface

---

## Key Features

### 🗓️ Monthly Subscription Cycles
- Automatic creation of monthly cycles for active subscriptions
- Configurable service frequency (daily, weekly, custom)
- Automatic service scheduling excluding buffer periods
- Cycle completion tracking and statistics

### ⏸️ Buffer Period Management
- **Automatic Activation**: Buffer periods start automatically 3 days before month-end
- **Manual Control**: Users and admins can manually start/end buffer periods
- **Service Pausing**: All services are automatically paused during buffer periods
- **Customizable Duration**: Configurable buffer period length (default: 3 days)

### 👩‍🔧 Smart Maid Assignment
- Automatic maid assignment with buffer period awareness
- Intelligent ranking based on rating, proximity, workload, and skills
- Handles buffer period skipping and service resumption
- Real-time availability checking

### 📊 Comprehensive Analytics
- Subscription cycle tracking
- Buffer period usage statistics
- Maid utilization analytics
- Service completion rates
- Revenue tracking

---

## API Endpoints

### User Subscription Management

#### Get Monthly Subscription Status
```
GET /api/subscriptions/monthly-status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "hasActiveSubscription": true,
  "subscription": {
    "id": "sub_123",
    "status": "ACTIVE",
    "plan": {...},
    "isInBufferPeriod": false,
    "bufferDaysCount": 3,
    "currentCycleStart": "2025-01-01T00:00:00Z",
    "currentCycleEnd": "2025-01-31T23:59:59Z"
  },
  "currentCycle": {...},
  "activeBuffer": null,
  "daysUntilBuffer": 15,
  "upcomingBookings": [...],
  "summary": {
    "servicesThisMonth": 25,
    "bufferPeriodActive": false,
    "nextBufferStart": "2025-01-29T00:00:00Z",
    "cycleProgress": 50
  }
}
```

#### Start Buffer Period
```
POST /api/subscriptions/buffer/start
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "CUSTOMER_REQUEST"
}
```

#### End Buffer Period
```
POST /api/subscriptions/buffer/end
Authorization: Bearer <token>
```

### User Dashboard

#### Get Subscription Dashboard
```
GET /api/dashboard/dashboard
Authorization: Bearer <token>
```

**Response includes:**
- Complete subscription status
- Service statistics
- Recent booking history
- Upcoming services
- Payment history
- Next payment information

#### Get Monthly Service Calendar
```
GET /api/dashboard/calendar?year=2025&month=1
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "month": {
    "year": 2025,
    "month": 1,
    "name": "January 2025"
  },
  "calendarData": [
    {
      "date": "2025-01-01",
      "dayOfWeek": "Wed",
      "bookings": [...],
      "isInBufferPeriod": false,
      "bufferReason": null
    }
  ],
  "monthSummary": {
    "totalBookings": 25,
    "completedServices": 20,
    "upcomingServices": 5,
    "bufferDays": 3
  }
}
```

#### Get Buffer Period History
```
GET /api/dashboard/buffer-history?page=1&limit=10
Authorization: Bearer <token>
```

#### Get Subscription Cycle History
```
GET /api/dashboard/cycle-history?page=1&limit=10
Authorization: Bearer <token>
```

### Admin Management

#### Get Subscription Analytics
```
GET /api/subscriptions/admin/analytics
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptions": {
      "total": 1250,
      "active": 980,
      "inBuffer": 45,
      "thisMonth": 123,
      "lastMonth": 98,
      "growth": "25.51"
    },
    "bufferPeriods": {
      "active": 45,
      "thisMonth": 234
    },
    "revenue": {
      "thisMonth": 125000,
      "lastMonth": 98000,
      "growth": "27.55"
    }
  }
}
```

#### Get All Subscription Cycles
```
GET /api/subscriptions/admin/cycles?page=1&limit=20&status=ACTIVE
Authorization: Bearer <admin-token>
```

#### Get All Buffer Periods
```
GET /api/subscriptions/admin/buffers?page=1&limit=20&status=ACTIVE
Authorization: Bearer <admin-token>
```

#### Manually Start Buffer Period (Admin)
```
POST /api/subscriptions/admin/{subscriptionId}/buffer/start
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "reason": "ADMIN_PAUSE",
  "notes": "Customer requested pause due to travel"
}
```

#### Manually End Buffer Period (Admin)
```
POST /api/subscriptions/admin/{subscriptionId}/buffer/end
Authorization: Bearer <admin-token>
```

---

## Database Schema Changes

### Updated Subscription Model
```prisma
model Subscription {
  // ... existing fields
  
  // New Buffer Management Fields
  currentCycleStart    DateTime?
  currentCycleEnd      DateTime?
  bufferDaysCount      Int       @default(3)
  bufferDaysUsed       Int       @default(0)
  isInBufferPeriod     Boolean   @default(false)
  bufferStartDate      DateTime?
  bufferEndDate        DateTime?
  isPaused             Boolean   @default(false)
  pausedAt             DateTime?
  resumeAt             DateTime?
  pauseReason          String?
  totalCycles          Int       @default(0)
  completedCycles      Int       @default(0)
  lastRenewalDate      DateTime?
  
  // New Relations
  cycles               SubscriptionCycle[]
  bufferPeriods        BufferPeriod[]
}
```

### New SubscriptionCycle Model
```prisma
model SubscriptionCycle {
  id                String                  @id @default(uuid())
  subscriptionId    String
  cycleNumber       Int
  startDate         DateTime
  endDate           DateTime
  status            SubscriptionCycleStatus @default(ACTIVE)
  totalServices     Int                     @default(0)
  completedServices Int                     @default(0)
  skippedServices   Int                     @default(0)
  bufferDaysUsed    Int                     @default(0)
  isBufferActive    Boolean                 @default(false)
  bufferStartDate   DateTime?
  bufferEndDate     DateTime?
  renewalDate       DateTime?
  paymentStatus     PaymentStatus           @default(COMPLETED)
  amount            Float
  
  subscription      Subscription            @relation(fields: [subscriptionId], references: [id])
  bookings          Booking[]               @relation("CycleBookings")
  bufferPeriods     BufferPeriod[]
}
```

### New BufferPeriod Model
```prisma
model BufferPeriod {
  id               String         @id @default(uuid())
  subscriptionId   String
  cycleId          String?
  startDate        DateTime
  endDate          DateTime
  status           BufferStatus   @default(ACTIVE)
  reason           BufferReason   @default(END_OF_MONTH)
  daysCount        Int            @default(3)
  servicesSkipped  Int            @default(0)
  autoResumeDate   DateTime
  resumedAt        DateTime?
  isAutomatic      Boolean        @default(true)
  notes            String?
  
  subscription     Subscription   @relation(fields: [subscriptionId], references: [id])
  cycle            SubscriptionCycle? @relation(fields: [cycleId], references: [id])
}
```

---

## Automated Scheduling

### Monthly Subscription Scheduler

The system includes a comprehensive scheduler that runs the following jobs:

#### Daily Jobs
- **7:00 AM**: Assign maids to unassigned bookings
- **8:00 AM**: Check and end completed buffer periods
- **9:00 AM**: Check and start new buffer periods
- **6:00 AM**: Schedule monthly services (1st of each month)
- **7:00 PM**: Send buffer period reminders

#### Daily Renewal Jobs
- **12:00 AM (Midnight)**: Process subscription renewals

#### Weekly Jobs
- **Sunday 2:00 AM**: Cleanup expired data and update statistics

#### Health Monitoring
- **Every 6 hours**: System health checks and status logging

### Buffer Period Logic

1. **Automatic Activation**: 
   - Triggered 3 days before month-end
   - All services during buffer period are cancelled
   - Customers receive notifications

2. **Automatic Resumption**:
   - Buffer periods end automatically after configured duration
   - Services resume with new monthly scheduling
   - New cycle begins

3. **Manual Control**:
   - Users can request early buffer periods
   - Admins can override buffer periods
   - Custom reasons and notes supported

---

## Service Integration

### Maid Scheduling Service

The new `MaidSchedulingService` provides:

- **Buffer-Aware Assignment**: Skips bookings during active buffer periods
- **Smart Ranking Algorithm**: Considers rating, distance, workload, and skills
- **Real-time Availability**: Checks maid availability and capacity
- **Automatic Notifications**: Sends assignment notifications to all parties

### Notification Enhancements

New notification types added:
- `BUFFER_PERIOD_STARTED`
- `BUFFER_PERIOD_ENDED` 
- `BUFFER_PERIOD_APPROACHING`
- `BUFFER_PERIOD_ENDING`
- `MONTHLY_CYCLE_STARTED`
- `MONTHLY_CYCLE_COMPLETED`
- `SUBSCRIPTION_EXPIRED`
- `MONTHLY_SERVICES_SCHEDULED`

---

## Migration Guide

### From Daily Confirmation to Monthly Subscription

1. **Database Migration**: 
   ```bash
   npm run prisma:db:push
   npm run prisma:generate
   ```

2. **Seed Data Update**:
   ```bash
   npm run prisma:seed
   ```

3. **Environment Variables**:
   No new environment variables required.

4. **Frontend Integration**:
   - Replace daily confirmation UI with monthly dashboard
   - Implement buffer period management interface
   - Add subscription cycle and analytics views

### Breaking Changes

1. **Removed Endpoints**:
   - `POST /api/subscriptions/confirm-service` (replaced with monthly scheduling)

2. **Updated Endpoints**:
   - `GET /api/subscriptions/status` (enhanced with buffer information)
   - All subscription-related endpoints now include buffer data

3. **New Required Fields**:
   - ServicePlan now includes `bufferDaysAllowed`
   - Booking includes `isSubscriptionBased` and `isBufferSkipped`

---

## Testing

### Manual Testing Scenarios

1. **Buffer Period Activation**:
   ```bash
   # Trigger manual buffer activation
   curl -X POST http://localhost:3000/api/subscriptions/buffer/start \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"reason": "CUSTOMER_REQUEST"}'
   ```

2. **Dashboard Data Retrieval**:
   ```bash
   # Get complete dashboard
   curl -X GET http://localhost:3000/api/dashboard/dashboard \
     -H "Authorization: Bearer <token>"
   ```

3. **Monthly Calendar**:
   ```bash
   # Get January 2025 calendar
   curl -X GET "http://localhost:3000/api/dashboard/calendar?year=2025&month=1" \
     -H "Authorization: Bearer <token>"
   ```

### Scheduler Testing

The scheduler includes manual trigger methods for testing:

```javascript
// Test buffer period activation
await monthlyScheduler.manualTriggerBufferActivation();

// Test buffer period completion
await monthlyScheduler.manualTriggerBufferCompletion(); 

// Test subscription renewals
await monthlyScheduler.manualTriggerRenewals();
```

---

## Performance Considerations

### Database Indexing
New indexes added for optimal query performance:
- `Subscription.currentCycleEnd`
- `Subscription.isInBufferPeriod`
- `BufferPeriod.autoResumeDate`
- `SubscriptionCycle.status`

### Caching Strategy
- Subscription status cached for 5 minutes
- Dashboard data cached for 10 minutes
- Analytics data cached for 30 minutes

### Monitoring
- All scheduler jobs logged with performance metrics
- Database query performance tracked
- Memory usage monitoring included

---

## Future Enhancements

1. **Advanced Buffer Customization**:
   - Variable buffer periods per customer
   - Multiple buffer periods per cycle
   - Custom buffer scheduling

2. **AI-Powered Scheduling**:
   - Machine learning for optimal service times
   - Predictive maid availability
   - Customer preference learning

3. **Enhanced Analytics**:
   - Customer satisfaction correlation with buffer usage
   - Seasonal buffer period optimization
   - Revenue impact analysis

---

## Support

For technical support or questions regarding the monthly subscription system:

1. Check the API documentation above
2. Review the database schema changes
3. Test with the provided curl examples
4. Monitor scheduler logs for automated processes

The system is designed to be production-ready with comprehensive error handling, logging, and monitoring capabilities.
