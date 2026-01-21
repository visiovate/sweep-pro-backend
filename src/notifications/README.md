# Notifications (Outbox + BullMQ)

## Architecture

- Controllers/services **do not send emails**.
- Controllers/services **publish durable events** to Postgres (`NotificationOutboxEvent`).
- `outboxDispatcherWorker` polls outbox rows and enqueues jobs to BullMQ (`notifications` queue).
- `notificationWorker` consumes jobs and performs deliveries:
  - In-app: inserts `Notification` rows (consumed by your existing WebSocket + API)
  - Email: sends via **Resend** (`RESEND_API_KEY`) with retry + idempotency.

Idempotency is enforced via:
- `NotificationOutboxEvent.dedupeKey` (optional unique)
- `NotificationDelivery` unique key `(outboxEventId, userId, channel)`

## Environment

Required:
- `DATABASE_URL`
- `REDIS_URL` (recommended) OR `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`

Email:
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `FROM_NAME`
- `FRONTEND_URL`

## Running locally

Terminal 1 (API):
- `npm run dev`

Terminal 2 (outbox dispatcher):
- `npm run worker:outbox`

Terminal 3 (notification worker):
- `npm run worker:notifications`

## Render deployment

Create 3 Render services:
- **Web Service**: `npm start`
- **Background Worker (Outbox)**: `npm run worker:outbox`
- **Background Worker (Notifications)**: `npm run worker:notifications`

All three must share:
- same `DATABASE_URL`
- same `REDIS_URL`
- same Resend env vars

## Marketing trigger

The backend provides:
- `POST /api/events/pricing-visited` (authenticated)

This stores `UserEvent(PRICING_VISITED)` and publishes `marketing.pricing_visited`.
The notification worker schedules a delayed outbox event `marketing.pricing_abandoned` (+24h) and sends an email only if the user still has no ACTIVE subscription.
