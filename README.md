# Sweepro Backend API

Production-grade REST API powering the Sweepro home cleaning subscription platform. Built with Express.js, PostgreSQL (Prisma ORM), Redis, and BullMQ for background job processing.

**Live API:** `https://sweepro.in`
**Frontend:** `https://www.sweepro.in`
**Hosted on:** Render (Web Service + Background Workers + Cron Jobs)

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Getting Started](#getting-started)
5. [Environment Variables](#environment-variables)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [Authentication](#authentication)
9. [Payment Integration (Razorpay)](#payment-integration-razorpay)
10. [Real-Time Notifications (WebSocket)](#real-time-notifications-websocket)
11. [Background Jobs & Cron](#background-jobs--cron)
12. [Email System](#email-system)
13. [File Uploads (Cloudinary)](#file-uploads-cloudinary)
14. [Security](#security)
15. [Testing](#testing)
16. [Deployment](#deployment)
17. [Monitoring](#monitoring)
18. [Default Credentials (Dev)](#default-credentials-dev)
19. [NPM Scripts Reference](#npm-scripts-reference)
20. [Troubleshooting](#troubleshooting)

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20.x |
| Framework | Express.js | 4.18 |
| Database | PostgreSQL (Aiven Cloud) | 15+ |
| ORM | Prisma | 6.x |
| Cache / Queue Broker | Redis (ioredis) | 5.x |
| Job Queue | BullMQ | 5.x |
| Auth | JWT (jsonwebtoken) + Firebase Admin SDK | - |
| Payments | Razorpay | 2.9 |
| File Storage | Cloudinary | 2.7 |
| Email | SendGrid + Nodemailer (SMTP) + Resend | - |
| WebSocket | ws (native) | 8.x |
| PDF Generation | PDFKit | 0.17 |
| Logging | Winston | 3.x |
| Process Scheduling | node-cron | 4.x |
| Security | Helmet, CORS, express-rate-limit, bcryptjs | - |
| Validation | express-validator | 7.x |

---

## Architecture Overview

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                   Client (React SPA on Vercel)                   │
 └──────────┬────────────────────────────┬──────────────────────────┘
            │ HTTPS (REST API)           │ WSS (WebSocket)
            ▼                            ▼
 ┌───────────────────────┐    ┌──────────────────────────┐
 │   Express.js Server   │    │   WebSocket Server (ws)  │
 │   (Render Web Svc)    │    │   JWT auth on upgrade    │
 │                       │    │   Same process as HTTP   │
 │  ┌─────────────────┐  │    └────────────┬─────────────┘
 │  │   Middleware     │  │                │
 │  │  Helmet, CORS,  │  │                │
 │  │  CSRF, RateLimit │  │                │
 │  │  Auth (JWT/FB)  │  │                │
 │  └────────┬────────┘  │                │
 │           ▼           │                │
 │  ┌─────────────────┐  │                │
 │  │  Controllers    │  │                │
 │  │  (25 modules)   │  │                │
 │  └────────┬────────┘  │                │
 │           ▼           │                │
 │  ┌─────────────────┐  │                │
 │  │   Services      │──┼────────────────┘
 │  │  (15 modules)   │  │
 │  └────────┬────────┘  │
 └───────────┼───────────┘
             │
     ┌───────┴───────┐
     ▼               ▼
 ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐
 │PostgreSQL│   │  Redis       │   │  External Services   │
 │ (Aiven)  │   │  - Blacklist │   │  - Razorpay          │
 │ 30+ tbls │   │  - BullMQ    │   │  - Cloudinary        │
 │ UUID PKs │   │  - Dedup     │   │  - Firebase Auth     │
 └──────────┘   └──────┬───────┘   │  - SendGrid / SMTP   │
                       │           └──────────────────────┘
                       ▼
            ┌─────────────────────┐
            │  Background Workers │    ┌────────────────────┐
            │  (Render BG Svcs)   │    │   Cron Jobs        │
            │  - Assignment Wkr   │    │   (Render Cron)    │
            │  - Subscription Wkr │    │   - Assignment     │
            │  - Reassign Wkr     │    │   - Expired Reqs   │
            │  - Notification Wkr │    │   - Subscriptions  │
            │  - Outbox Dispatch  │    └────────────────────┘
            └─────────────────────┘
```

---

## Project Structure

```
sweep-pro-backend/
├── prisma/
│   ├── schema.prisma                 # Full database schema (30+ models, 30+ enums)
│   ├── seed.js                       # Main database seed script
│   ├── seed-apartments-only.js       # Apartments-only seed
│   ├── seed-clean.js                 # Clean seed (fresh start)
│   ├── seed-timeslots.js             # Time slot seed data
│   └── migrations/                   # Prisma migration history
│
├── src/
│   ├── index.js                      # App entry point (Express + WebSocket server)
│   │
│   ├── config/
│   │   ├── firebase.js               # Firebase Admin SDK initialization
│   │   ├── redis.js                  # Redis / BullMQ connection config
│   │   └── validateEnv.js            # Startup env validation (crashes on missing critical vars)
│   │
│   ├── constants/
│   │   └── termsAndConditions.js     # Terms & Conditions content
│   │
│   ├── controllers/                  # 25 controller modules
│   │   ├── adminController.js
│   │   ├── adminAssignmentController.js
│   │   ├── assignmentController.js
│   │   ├── automaticAssignmentController.js
│   │   ├── automaticBookingController.js
│   │   ├── bookingCompletionController.js
│   │   ├── bookingController.js
│   │   ├── bookingRequestController.js
│   │   ├── bufferController.js
│   │   ├── customerAssignmentController.js
│   │   ├── customerBookingCompletionController.js
│   │   ├── documentController.js
│   │   ├── eventController.js
│   │   ├── feedbackAdminController.js
│   │   ├── feedbackController.js
│   │   ├── issueController.js
│   │   ├── maidController.js
│   │   ├── notificationController.js
│   │   ├── paymentController.js
│   │   ├── profileController.js
│   │   ├── queueController.js
│   │   ├── serviceController.js
│   │   ├── subscriptionController.js
│   │   ├── userController.js
│   │   └── userDashboardController.js
│   │
│   ├── middleware/
│   │   ├── auth.js                   # JWT + Firebase token auth, RBAC
│   │   ├── csrf.js                   # Double-submit cookie CSRF protection
│   │   ├── firebaseAuth.js           # Firebase-specific auth middleware
│   │   ├── rateLimiters.js           # Rate limiters (auth, payment, global)
│   │   ├── validation.js             # express-validator rules
│   │   ├── webhookSignatureVerifier.js   # Razorpay webhook HMAC verification
│   │   ├── subscriptionValidation.js # Active subscription guard
│   │   └── bufferEligibility.js      # Buffer period eligibility check
│   │
│   ├── routes/                       # 28 route files (Express Router)
│   │   ├── authRoutes.js             # POST /api/auth/register, login, logout, etc.
│   │   ├── firebaseAuthRoutes.js     # POST /api/auth/firebase/login, etc.
│   │   ├── userRoutes.js
│   │   ├── bookingRoutes.js
│   │   ├── paymentRoutes.js
│   │   ├── serviceRoutes.js
│   │   ├── maidRoutes.js
│   │   ├── adminRoutes.js
│   │   ├── subscriptionRoutes.js
│   │   ├── assignmentRoutes.js
│   │   ├── notificationRoutes.js
│   │   ├── documentRoutes.js
│   │   ├── feedbackRoutes.js
│   │   ├── profileRoutes.js
│   │   ├── bufferRoutes.js
│   │   ├── bookingCompletionRoutes.js
│   │   ├── bookingCompletionCustomerRoutes.js
│   │   ├── bookingRequestRoutes.js
│   │   ├── bookingDeduplicationRoutes.js
│   │   ├── automaticBookingRoutes.js
│   │   ├── automaticAssignmentRoutes.js
│   │   ├── customerAssignmentRoutes.js
│   │   ├── queueRoutes.js
│   │   ├── userDashboardRoutes.js
│   │   ├── eventRoutes.js
│   │   ├── termsRoutes.js
│   │   ├── issueRoutes.js
│   │   └── testRoutes.js
│   │
│   ├── services/                     # Business logic layer
│   │   ├── razorpayService.js        # Full Razorpay payment integration
│   │   ├── cloudinaryService.js      # Cloud file management
│   │   ├── notificationService.js    # WebSocket real-time notifications
│   │   ├── invoiceService.js         # PDF invoice generation (PDFKit)
│   │   ├── automaticAssignmentService.js
│   │   ├── bookingDeduplicationService.js
│   │   ├── bookingRequestService.js
│   │   ├── maidSchedulingService.js
│   │   ├── subscriptionBufferService.js
│   │   ├── subscriptionScheduler.js
│   │   ├── feedbackAnalyticsService.js
│   │   ├── feedbackAuditService.js
│   │   ├── ratingRecalculationService.js
│   │   ├── BufferDayService.js
│   │   ├── AutomaticServiceScheduler.js
│   │   ├── jobScheduler.js
│   │   └── notification/
│   │       └── EmailService.js       # SendGrid + SMTP email (6 HTML templates)
│   │
│   ├── notifications/                # Transactional outbox notification system
│   │   ├── email/
│   │   │   ├── resendEmailService.js
│   │   │   └── templates.js
│   │   ├── events/
│   │   │   ├── publishEvent.js
│   │   │   └── topics.js
│   │   └── queues/
│   │       └── notificationQueue.js
│   │
│   ├── workers/                      # BullMQ background workers
│   │   ├── assignmentWorkerFixed.js  # Production maid assignment worker
│   │   ├── subscriptionWorker.js     # Subscription lifecycle worker
│   │   ├── adminReassignWorker.js    # Admin reassignment worker
│   │   ├── notificationWorker.js     # Notification dispatch worker
│   │   └── outboxDispatcherWorker.js # Transactional outbox dispatcher
│   │
│   ├── cron/                         # Scheduled cron jobs
│   │   ├── assignmentCron.js         # Creates tomorrow's bookings from subscriptions
│   │   ├── expiredRequestsCron.js    # Cleans expired assignment requests (every 30 min)
│   │   ├── subscriptionCron.js       # Daily midnight: buffer, renewals
│   │   └── cronManager.js           # Centralized cron registration
│   │
│   ├── queues/
│   │   ├── assignmentQueue.js
│   │   └── adminReassignQueue.js
│   │
│   ├── monitoring/
│   │   └── bullBoard.js             # Bull Board monitoring UI
│   │
│   └── utils/
│       ├── database.js               # Prisma client singleton with retry logic
│       ├── logger.js                 # Winston structured logger
│       ├── fileUpload.js             # Multer config (5MB limit, images + PDF)
│       ├── cache.js                  # In-memory cache
│       ├── tokenBlacklist.js         # Redis-based JWT blacklist
│       ├── razorpay-credintials.js   # Razorpay SDK initialization
│       ├── retryUtils.js             # DB / Redis retry helpers
│       ├── timeSlotUtils.js
│       ├── timeUtils.js
│       ├── weekdayUtils.js
│       └── notificationTemplates.js
│
├── scripts/
│   ├── pre-deployment-check.js       # Pre-deploy validation
│   ├── start-production.sh
│   ├── start-worker.sh / .ps1
│   ├── run-cron.sh / .ps1
│   └── cleanup-invalid-active-subscriptions.js
│
├── postman/
│   ├── Sweep-Pro-Notifications.postman_collection.json
│   └── Sweep-Pro-Razorpay-Tests.postman_collection.json
│
├── Dockerfile
├── docker-compose.yml                # Local PostgreSQL container
├── .env.example.aws                  # Environment variable template
└── package.json
```

---

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20.x | Required (enforced in `package.json` engines) |
| PostgreSQL | 15+ | Local via Docker or cloud (Aiven, AWS RDS) |
| Redis | 6+ | Required for BullMQ workers and token blacklisting |

### Local Development Setup

```bash
# 1. Clone and install dependencies
cd sweep-pro-backend
npm install          # also runs `prisma generate` via postinstall

# 2. Configure environment
cp .env.example.aws .env
# Edit .env with your credentials (see Environment Variables section)

# 3. Start PostgreSQL (Option A: Docker)
docker-compose up -d
# Creates a PostgreSQL 15 container on port 5432
# Default: postgres/postgres, database: sweep_pro

# 3. Start PostgreSQL (Option B: Cloud database)
# Set DATABASE_URL in .env to your connection string

# 4. Run database migrations
npx prisma migrate deploy

# 5. Seed the database with sample data
npm run prisma:seed

# 6. Start the development server
npm run dev
# Server starts at http://localhost:3000

# 7. (Optional) Start background workers in separate terminals
npm run worker:dev            # Assignment worker (with hot reload)
npm run worker:subscription   # Subscription worker

# 8. (Optional) Open Prisma Studio (database GUI)
npm run prisma:studio
# Opens at http://localhost:5555
```

### Docker Setup

```bash
# Start PostgreSQL only (recommended for local dev)
docker-compose up -d

# Or build the full backend container
docker build -t sweepro-backend .
docker run -p 5000:5000 --env-file .env sweepro-backend
```

### Verify Installation

```bash
curl http://localhost:3000/health
# Expected: { "status": "ok", "database": "connected", "redis": "connected" }
```

---

## Environment Variables

Copy `.env.example.aws` to `.env` and fill in all values.

### Critical (app crashes on startup if missing)

| Variable | Constraint | Description |
|---|---|---|
| `DATABASE_URL` | min 20 chars | PostgreSQL connection string |
| `JWT_SECRET` | min 32 chars | JWT signing secret |
| `RAZORPAY_WEBHOOK_SECRET` | min 20 chars | Razorpay webhook HMAC secret |

### Core Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `TZ` | `UTC` | Server timezone |
| `CORS_ORIGIN` | - | Allowed CORS origin |
| `FRONTEND_URL` | - | Frontend URL (used in email links) |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection string |

### Razorpay (Payment Gateway)

| Variable | Description |
|---|---|
| `RAZORPAY_TEST_KEY_ID` | Razorpay API key ID |
| `RAZORPAY_TEST_KEY_SECRET` | Razorpay API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signature verification secret |

### Firebase (Google OAuth)

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_CLIENT_ID` | Service account client ID |
| `FIREBASE_PRIVATE_KEY_BASE64` | Base64-encoded private key |
| `FIREBASE_PRIVATE_KEY_ID` | Private key ID |

### Cloudinary (File Storage)

| Variable | Description |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloud name |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret |

### Email Configuration

| Variable | Description |
|---|---|
| `FROM_EMAIL` | Sender email address |
| `FROM_NAME` | Sender display name |
| `SMTP_HOST` | SMTP server (e.g., `smtp.gmail.com`) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_PORT` | SMTP port (default: `587`) |
| `SENDGRID_API_KEY` | _(Optional)_ SendGrid API key |
| `RESEND_API_KEY` | _(Optional)_ Resend API key |

### Optional

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | - | Additional CORS origins (comma-separated) |
| `ALLOWED_ORIGIN_REGEXES` | - | CORS regex patterns (pipe-separated) |
| `ASSIGNMENT_REQUEST_HOURS_BEFORE` | `20` | Hours before service to send assignment |
| `WORKER_CONCURRENCY` | `5` | BullMQ worker concurrency |

---

## Database Schema

The full schema is defined in `prisma/schema.prisma`. The database uses **UUID primary keys** throughout.

### Core Models (30+ tables)

| Model | Purpose |
|---|---|
| **User** | Central entity (_email, phone, role, apartment, GPS coords_) |
| **CustomerProfile** | Preferences, booking count, spend, preferred maids |
| **MaidProfile** | Skills, languages, availability, rating, commission, max daily bookings |
| **AdminProfile** | Permissions, department, designation |
| **Service** | Catalog (_CLEANING, DEEP_CLEANING, MAINTENANCE, SPECIAL_EVENT_) |
| **Task** | Per-service checklist items, multi-language instructions |
| **Booking** | Core booking (_customer, maid, service, status, scheduling, amount_) |
| **Payment** | Razorpay payments, invoice numbers, refund tracking |
| **Subscription** | Plan enrollment, billing cycle, buffer tracking |
| **ServicePlan** | Plan definitions (_sessions/week, pricing, buffer days_) |
| **SubscriptionCycle** | Monthly cycle tracking within a subscription |
| **BufferPeriod** | Subscription pause period management |
| **Feedback** | Multi-dimensional ratings (_overall, quality, punctuality, behavior_) |
| **AssignmentRequest** | Maid booking assignment workflow (with expiry) |
| **CustomerMaidAssignment** | Permanent customer-maid mapping |
| **MaidDocument** | Verification documents (_Aadhar, PAN, police verification_) |
| **Notification** | In-app notifications with read/delivered status |
| **NotificationOutboxEvent** | Transactional outbox for reliable delivery |
| **Zone** | Geographic service zones (boundaries, max maids) |
| **Attendance** | Maid check-in/check-out records |
| **PerformanceMetric** | Monthly maid performance aggregation |
| **LocationHistory** | Maid GPS tracking |
| **Issue** | Support issues (type, category, priority, status, resolution) |
| **AuditLog** | System-wide audit trail (action, old/new values) |
| **ServiceOTP** | Start/end OTP verification for bookings |
| **SystemConfig** | Key-value system configuration store |

### User Roles

| Role | Description |
|---|---|
| `CUSTOMER` | Books services, manages subscriptions, submits feedback |
| `MAID` | Accepts bookings, submits verification docs, manages availability |
| `FLOATING_MAID` | Pool maid assigned to unmatched bookings |
| `ADMIN` | Full system management access |
| `SUPERVISOR` | Supervisory access with real-time alerts |

### Booking Status Lifecycle

```
PENDING ──> CONFIRMED ──> ASSIGNED ──> IN_PROGRESS ──> COMPLETED
   │             │            │
   └── CANCELLED └── CANCELLED└── REASSIGNED / NO_SHOW
```

### Schema Commands

```bash
npx prisma studio                     # Visual database browser (localhost:5555)
npx prisma migrate dev --name <name>  # Create new migration
npx prisma migrate deploy             # Apply migrations (production)
npx prisma migrate reset              # Reset database (destructive!)
npm run prisma:seed                    # Seed with sample data
```

---

## API Reference

Base URL: `http://localhost:3000/api`
All endpoints are prefixed with `/api`.

### Health Check

```
GET /health          → { status, database, redis, timestamp }
```

### Authentication — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | - | Register (email, password, phone, role) |
| `POST` | `/auth/login` | - | Login (returns JWT cookie + body) |
| `GET` | `/auth/me` | JWT | Current user info |
| `POST` | `/auth/logout` | - | Logout (clears cookie, blacklists token) |
| `POST` | `/auth/forgot-password` | - | Send password reset email |
| `POST` | `/auth/reset-password` | - | Reset password with token |
| `POST` | `/auth/change-password` | JWT | Change password |
| `GET` | `/auth/apartments` | - | Apartment list for onboarding |
| `POST` | `/auth/firebase/login` | - | Google OAuth via Firebase ID token |
| `GET` | `/auth/firebase/me` | Firebase | Get user via Firebase token |
| `POST` | `/auth/firebase/complete-profile` | JWT | Complete profile after OAuth |
| `PUT` | `/auth/firebase/update-profile` | JWT | Update address/location |

### Services — `/api/services`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/services` | - | List all services |
| `GET` | `/services/:id` | - | Service details |
| `POST` | `/services` | Admin | Create service |
| `PUT` | `/services/:id` | Admin | Update service |

### Bookings — `/api/bookings`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/bookings` | Customer | Create booking |
| `GET` | `/bookings/my-bookings` | Customer | Customer's bookings |
| `GET` | `/bookings/my-assignments` | Maid | Maid's assigned bookings |
| `PUT` | `/bookings/:id/status` | JWT | Update booking status |
| `DELETE` | `/bookings/:id` | JWT | Cancel booking |
| `GET` | `/bookings/available-slots` | JWT | Available time slots |
| `POST` | `/bookings/estimate-cost` | JWT | Cost estimate |

### Booking Completion — `/api/booking-completion`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/booking-completion/maid/qr-code` | Maid | Maid's personal QR code |
| `POST` | `/booking-completion/:id/start` | Maid | Start service (OTP) |
| `POST` | `/booking-completion/:id/complete` | Maid/Cust | Complete via QR scan |

### Payments — `/api/payments`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/payments/razorpay/booking/create-order` | Customer | Create Razorpay booking order |
| `POST` | `/payments/razorpay/subscription/create-order` | Customer | Create subscription order |
| `POST` | `/payments/razorpay/verify` | Customer | Verify payment signature |
| `POST` | `/payments/razorpay/failure` | Customer | Report payment failure |
| `GET` | `/payments/my-payments` | JWT | Payment history (paginated) |
| `GET` | `/payments/:id/invoice` | JWT | Download PDF invoice |
| `POST` | `/payments/webhook` | Razorpay | Webhook handler (HMAC verified) |

### Subscriptions — `/api/subscriptions`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/subscriptions/plans` | - | All subscription plans |
| `POST` | `/subscriptions/subscribe` | Customer | Subscribe to a plan |
| `GET` | `/subscriptions/my-subscription` | Customer | Active subscription |
| `GET` | `/subscriptions/monthly-status` | Customer | Monthly status with buffer info |
| `POST` | `/subscriptions/buffer/start` | Customer | Start buffer period |
| `POST` | `/subscriptions/buffer/end` | Customer | End buffer period |
| `POST` | `/subscriptions/cancel` | Customer | Cancel subscription |

### Assignments — `/api/assignments`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/assignments/pending` | Maid | Pending requests for maid |
| `POST` | `/assignments/:id/accept` | Maid | Accept assignment |
| `POST` | `/assignments/:id/reject` | Maid | Reject assignment |
| `GET` | `/assignments/admin/assignments` | Admin | All assignments |
| `POST` | `/assignments/admin/send-assignment-request` | Admin | Send request to maid |
| `GET` | `/assignments/admin/available-maids/:bookingId` | Admin | Available maids for booking |

### Buffer Management — `/api/buffer`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/buffer/remaining` | Customer | Remaining buffer days |
| `POST` | `/buffer/request` | Customer | Request buffer days |
| `GET` | `/buffer/history` | Customer | Buffer usage history |
| `GET` | `/buffer/admin/pending` | Admin | Pending requests |
| `POST` | `/buffer/admin/approve` | Admin | Approve request |
| `POST` | `/buffer/admin/reject` | Admin | Reject request |
| `GET` | `/buffer/admin/statistics` | Admin | Usage statistics |

### Feedback — `/api/feedback`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/feedback` | Customer | Submit feedback |
| `GET` | `/feedback/my-feedback` | Customer | Customer's feedback |
| `GET` | `/feedback/eligible-bookings` | Customer | Bookings eligible for review |
| `GET` | `/feedback/all` | Admin | All feedback |
| `GET` | `/feedback/stats` | Admin | Feedback statistics |
| `POST` | `/feedback/:id/admin-response` | Admin | Admin response |

### Documents — `/api/documents`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/documents/upload-verification` | Maid | Upload documents (multipart) |
| `GET` | `/documents/maid-verification-status` | Maid | Verification status |
| `GET` | `/documents/admin-verification-data` | Admin | All submissions |
| `POST` | `/documents/verification/:id/approve` | Admin | Approve document |
| `POST` | `/documents/verification/:id/reject` | Admin | Reject document |

### Notifications — `/api/notifications`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/notifications` | JWT | Paginated notifications |
| `GET` | `/notifications/unread-count` | JWT | Unread count |
| `PATCH` | `/notifications/:id/read` | JWT | Mark as read |
| `PATCH` | `/notifications/mark-all-read` | JWT | Mark all as read |
| `DELETE` | `/notifications/:id` | JWT | Delete notification |

### Profile — `/api/profile`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/profile/me` | JWT | Full profile details |
| `PUT` | `/profile/user` | JWT | Update profile |
| `POST` | `/profile/image` | JWT | Upload profile image |
| `GET` | `/profile/stats` | JWT | Profile statistics |

### Dashboard — `/api/dashboard`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/dashboard/dashboard` | JWT | Dashboard statistics |
| `GET` | `/dashboard/calendar` | JWT | Monthly calendar data |
| `GET` | `/dashboard/buffer-history` | JWT | Buffer history |

### Admin — `/api/admin`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/admin/customer-assignments` | Admin | All customer-maid assignments |
| `POST` | `/admin/customer-assignments/assign` | Admin | Assign maid to customer |
| `GET` | `/admin/customer-assignments/:customerId` | Admin | Customer's assignment |

### Automatic Bookings — `/api/automatic-bookings`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/automatic-bookings` | Admin | All auto-bookings |
| `POST` | `/automatic-bookings/create-daily` | Admin | Create daily bookings |
| `GET` | `/automatic-bookings/eligible-customers` | Admin | Eligible customers |
| `GET` | `/automatic-bookings/my-upcoming` | Customer | Upcoming auto-bookings |

---

## Authentication

### Dual Authentication Strategy

The API supports two authentication methods simultaneously:

**1. Email/Password (JWT)**
- Register/login with email and password
- Server issues JWT with payload `{ userId, id, role }`
- Delivered via HttpOnly cookie (`authToken`) **and** response body
- Cookie: `Secure`, `SameSite=none`, `HttpOnly` (production)
- Default TTL: 24 hours (30 days with `rememberMe: true`)

**2. Google OAuth (Firebase Admin SDK)**
- Client gets Firebase ID token via Google popup
- Sends to `POST /api/auth/firebase/login` with `intent` (login/signup)
- Server verifies via Firebase Admin SDK, issues app-level JWT
- New users must complete profile (phone, role, apartment)

### Token Resolution Priority

```
1. HttpOnly `authToken` cookie   (primary, most secure)
2. Authorization: Bearer <token> (fallback for cross-origin)
```

### Token Blacklisting (Redis)

- On logout, active token stored as `blacklist:<token>` in Redis
- TTL matches remaining token lifetime
- **Production:** fail-closed (Redis down = reject all tokens)
- **Development:** fail-open (Redis down = accept tokens)

### RBAC Middleware

```javascript
router.get('/admin/users', auth, authorizeAdmin, handler);
router.post('/bookings', auth, checkRole(['CUSTOMER']), handler);
router.get('/assignments', auth, authorizeMaid, handler);
```

---

## Payment Integration (Razorpay)

### Payment Flow

```
Customer ──> Create Order ──> Razorpay Checkout ──> Verify Signature ──> Complete
               (Server)          (Client SDK)          (Server)
```

1. **Create Order:** `POST /payments/razorpay/booking/create-order` (idempotent)
2. **Client Checkout:** Razorpay SDK popup opens on frontend
3. **Verify:** `POST /payments/razorpay/verify` (HMAC-SHA256 signature check)
4. **Processing:** Atomic status update with idempotency guard
5. **Webhook Backup:** `POST /payments/webhook` (raw body + HMAC verification)

### Features
- Idempotent order creation (returns existing order on duplicates)
- Constant-time signature comparison (`crypto.timingSafeEqual`)
- Full and partial refund support
- PDF invoice generation (PDFKit with branded styling)
- Payment methods: CARD, UPI, NET_BANKING, WALLET, CASH, BANK_TRANSFER
- Payment types: BOOKING, SUBSCRIPTION, RENEWAL

---

## Real-Time Notifications (WebSocket)

Built with the **`ws`** library (`noServer: true` mode).

### Connection Flow
```
1. Client connects to WSS endpoint
2. Server accepts upgrade (no token in URL — prevents log leakage)
3. Cookie-based pre-auth if HttpOnly cookie exists on upgrade
4. Client sends: { type: "auth", token: "<JWT>" }
5. Server verifies → maps to role-based client map
6. 5-second timeout for unauthenticated connections → auto-disconnect
```

### Client Maps
| Map | Key | Receives |
|---|---|---|
| `clients` | userId | All notifications |
| `adminClients` | Set | Admin alerts, system events |
| `maidClients` | userId | Assignment requests, booking updates |
| `customerClients` | userId | Booking status, payment confirmations |
| `supervisorClients` | Set | Supervisory alerts |

### Heartbeat
Ping/pong every 30 seconds to detect and clean up stale connections.

---

## Background Jobs & Cron

### BullMQ Workers (run as separate Render services)

| Worker | Command | Queue | Purpose |
|---|---|---|---|
| Assignment | `npm run worker` | `maid-assignment` | Process assignment requests (24h expiry) |
| Subscription | `npm run worker:subscription` | subscription | Buffer activation, renewals, scheduling |
| Admin Reassign | `npm run reassign-worker` | admin-reassign | Admin-initiated reassignment |
| Notification | _(automatic)_ | notification | Dispatch queued notifications |
| Outbox Dispatcher | _(automatic)_ | polling | Transactional outbox pattern |

### Cron Jobs

| Job | Command | Schedule | Purpose |
|---|---|---|---|
| Assignment | `npm run cron:assignment` | External trigger | Create tomorrow's bookings from subscriptions |
| Expired Requests | `npm run cron:expired` | Every 30 min | Clean expired assignment requests |
| Subscription | `npm run cron:subscriptions` | Daily midnight UTC | Buffer periods, renewals |

---

## Email System

### Provider Priority
1. **SendGrid** — if `SENDGRID_API_KEY` is set
2. **SMTP / Nodemailer** — configured via `SMTP_*` env vars
3. **Resend** — if `RESEND_API_KEY` is set

### Email Templates (branded HTML)

| Template | Trigger |
|---|---|
| `USER_REGISTERED` | New user signup |
| `SUBSCRIPTION_CREATED` | Subscription activated |
| `MAID_ASSIGNED` | Maid assigned to booking |
| `INACTIVE_USER_REMINDER` | User inactivity (includes 20% discount) |
| `SUBSCRIPTION_EXPIRING` | Subscription near expiry |
| `PAYMENT_SUCCESS` | Successful payment receipt |
| Password Reset | Forgot password (inline template) |

User notification preferences are respected (`NotificationPreference` model).

---

## File Uploads (Cloudinary)

### Local Handling (Multer)
- Directory: `uploads/documents/`
- Max size: **5MB** per file
- Accepted: JPEG, PNG, GIF, WebP, PDF

### Cloud Storage (Cloudinary)
- Folder structure: `maid-documents/{maidId}/{documentType}`
- Auto quality/format optimization
- Signed URL generation for secure access

### Required Maid Documents
| Document | Type |
|---|---|
| Aadhar Card | Identity proof |
| PAN Card | Tax ID |
| Electricity Bill | Address proof |
| Police Verification | _(Optional)_ |
| Photo | Profile image |

---

## Security

### Layers

| Protection | Implementation |
|---|---|
| HTTP Headers | Helmet with strict CSP in production |
| CORS | Static whitelist + regex for Vercel previews, `credentials: true` |
| CSRF | Double-submit cookie pattern (`csrf-token` cookie + `X-CSRF-Token` header) |
| Rate Limiting | Auth: 5/15min, Password Reset: 3/1hr, Payments: 10/15min, Global: 100/15min |
| Password Hashing | bcrypt, 12 salt rounds |
| Password Policy | Min 8 chars: uppercase + lowercase + digit + special |
| Reset Tokens | SHA-256 hashed, 1-hour expiry, single-use |
| JWT Security | Min 32-char secret enforced, no default fallback |
| Token Blacklisting | Redis-backed, fail-closed in production |
| Webhook Verification | HMAC-SHA256 with `crypto.timingSafeEqual` |
| WebSocket Auth | No token in URL (prevents log leakage) |
| Response Caching | `no-store, no-cache, must-revalidate` on all API routes |
| Account Enumeration | Generic response on forgot-password regardless of account existence |
| Graceful Shutdown | SIGTERM, SIGINT, SIGUSR2 handlers |
| Logging | No stack traces in production, no sensitive data logged |

### CSRF Exempt Paths
- Razorpay webhook (`/api/payments/webhook`)
- Login, Register, Firebase Login
- Forgot/Reset Password, Logout

---

## Testing

### Framework
**Jest** 29.x + **Supertest** 6.x

```bash
npm test                    # Run all tests
npm run test:coverage       # With coverage report
```

Rate limiters are automatically bypassed when `NODE_ENV=test`.

### Postman Collections
Import from `postman/` directory:
- `Sweep-Pro-Notifications.postman_collection.json`
- `Sweep-Pro-Razorpay-Tests.postman_collection.json`

---

## Deployment

### Production Architecture (Render)

| Service Type | Name | Command |
|---|---|---|
| Web Service | sweep-pro-backend | `npm start` |
| Background Worker | assignment-worker | `npm run worker` |
| Background Worker | subscription-worker | `npm run worker:subscription` |
| Background Worker | reassign-worker | `npm run reassign-worker` |
| Cron Job | assignment-cron | `npm run cron:assignment` |
| Cron Job | expired-requests-cron | `npm run cron:expired` |
| Cron Job | subscription-cron | `npm run cron:subscriptions` |

### Pre-Deployment Checklist

```bash
node scripts/pre-deployment-check.js
```

Validates:
- All critical environment variables are set and meet minimum lengths
- Database connection works
- Redis connection works
- Prisma client is generated

### Deployment Steps

```bash
# 1. Apply pending migrations
npm run prisma:migrate:deploy

# 2. Start (triggered by Render auto-deploy on push to main)
npm start
```

### Infrastructure Dependencies

| Service | Recommended Provider | Notes |
|---|---|---|
| PostgreSQL | Aiven Cloud | Enable connection pooling |
| Redis | Render Redis / Upstash | Required for BullMQ + token blacklisting |
| File Storage | Cloudinary | Free tier works for dev |
| Email | SendGrid | Production email delivery |
| Firebase | Google Cloud | Google OAuth only |
| Payments | Razorpay | Use test mode for dev |

---

## Monitoring

### Bull Board Dashboard
Accessible at `/admin/queues` (admin auth required). Shows queue health, job status, retry/clean/pause controls.

### Health Endpoint

```bash
curl https://sweepro.in/health
# { "status": "ok", "database": "connected", "redis": "connected", "timestamp": "..." }
```

### Logging
- **Production:** JSON format, `info` level, no stack traces
- **Development:** Colorized, `debug` level, full stack traces

---

## Default Credentials (Dev)

Created by `npm run prisma:seed`:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@sweepro.com` | `admin123` |
| Customer | `customer@sweepro.com` | `customer123` |

> **IMPORTANT:** Rotate all credentials and secrets before production deployment.

---

## NPM Scripts Reference

| Script | Purpose |
|---|---|
| `npm run dev` | Start dev server with hot reload (nodemon) |
| `npm start` | Start production server |
| `npm run worker` | Assignment worker |
| `npm run worker:dev` | Assignment worker (hot reload) |
| `npm run worker:subscription` | Subscription worker |
| `npm run reassign-worker` | Admin reassignment worker |
| `npm run cron:assignment` | Assignment cron job |
| `npm run cron:expired` | Expired requests cron |
| `npm run cron:subscriptions` | Subscription cron |
| `npm test` | Run test suite |
| `npm run test:coverage` | Tests with coverage |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Create + apply dev migration |
| `npm run prisma:migrate:deploy` | Apply migrations (production) |
| `npm run prisma:seed` | Seed database with sample data |
| `npm run prisma:studio` | Open Prisma Studio GUI |

---

## Troubleshooting

### "JWT_SECRET must be at least 32 characters"
Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### "Can't reach database server"
- Check `DATABASE_URL` format: `postgresql://user:pass@host:port/dbname?sslmode=require`
- Local: ensure PostgreSQL is running (`docker-compose up -d`)
- Cloud: verify SSL settings and IP whitelisting

### "Redis connection refused"
- Local: `redis-cli ping` should return `PONG`
- Most features work without Redis (with warnings), except token blacklisting and BullMQ

### CORS Errors
- Add frontend URL to `CORS_ORIGIN` in `.env`
- For multiple origins: use `ALLOWED_ORIGINS` (comma-separated)
- Frontend must use `credentials: 'include'` on all fetch calls

### Razorpay Webhook Not Working
- `RAZORPAY_WEBHOOK_SECRET` must match your Razorpay Dashboard setting
- Webhook URL must be publicly accessible (not `localhost`)
- Endpoint receives raw body automatically (configured in `index.js`)

### Firebase OAuth Failing
- `FIREBASE_PRIVATE_KEY_BASE64`: must be the full private key, Base64-encoded
- `FIREBASE_PROJECT_ID`: must match your Firebase Console project
- Add your domain to Firebase Console > Authentication > Authorized Domains

---

_Built by Visiovate Technologies_
