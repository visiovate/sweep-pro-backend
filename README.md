# Sweepro Backend API

This is the backend API for the Sweepro application, a platform for managing cleaning services.

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL
- npm or yarn

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sweepro?schema=public"
   JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   PORT=3000
   ```

4. Initialize the database:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run prisma:seed
   ```

## Running the Application

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Authentication
- POST `/api/auth/register` - Register a new user
- POST `/api/auth/login` - Login user

### Users
- GET `/api/users/profile` - Get user profile
- PUT `/api/users/profile` - Update user profile
- GET `/api/users` - Get all users (admin only)
- GET `/api/users/:id` - Get user by ID (admin only)
- PUT `/api/users/:id/role` - Update user role (admin only)
- PUT `/api/users/:id/status` - Update user status (admin only)
- DELETE `/api/users/:id` - Delete user (admin only)

### Services
- GET `/api/services` - Get all services
- GET `/api/services/:id` - Get service by ID
- POST `/api/services` - Create service (admin only)
- PUT `/api/services/:id` - Update service (admin only)
- DELETE `/api/services/:id` - Delete service (admin only)

### Bookings
- POST `/api/bookings` - Create booking
- GET `/api/bookings/my-bookings` - Get user's bookings
- GET `/api/bookings/my-assignments` - Get maid's assignments
- GET `/api/bookings` - Get all bookings (admin only)
- GET `/api/bookings/:id` - Get booking by ID (admin only)
- PUT `/api/bookings/:id/assign` - Assign maid to booking (admin only)
- PUT `/api/bookings/:id/status` - Update booking status
- PUT `/api/bookings/:id/cancel` - Cancel booking (admin only)

## Seed Data

The application comes with seed data for testing:

### Admin User
- Email: admin@sweepro.com
- Password: admin123

### Sample Maid
- Email: maid@sweepro.com
- Password: maid123

### Sample Customer
- Email: customer@sweepro.com
- Password: customer123

## Database Management

- View database with Prisma Studio:
  ```bash
  npm run prisma:studio
  ```

- Generate Prisma client:
  ```bash
  npm run prisma:generate
  ```

- Run migrations:
  ```bash
  npm run prisma:migrate
  ```

- Seed database:
  ```bash
  npm run prisma:seed
  ``` 