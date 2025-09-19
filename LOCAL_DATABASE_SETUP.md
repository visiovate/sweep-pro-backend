# Local PostgreSQL Database Setup

## Option 1: Install PostgreSQL locally (Recommended)

### 1. Download and Install PostgreSQL
1. Go to https://www.postgresql.org/download/windows/
2. Download the Windows installer (latest version)
3. Run the installer with these settings:
   - Port: 5432 (default)
   - Username: postgres
   - Password: (choose a strong password, e.g., "admin123")
   - Install all components

### 2. Create Database
After installation:
```bash
# Connect to PostgreSQL (use password you set during installation)
psql -U postgres -h localhost

# Create database
CREATE DATABASE sweep_pro_dev;

# Create user (optional, for better security)
CREATE USER sweep_user WITH ENCRYPTED PASSWORD 'sweep_pass123';
GRANT ALL PRIVILEGES ON DATABASE sweep_pro_dev TO sweep_user;

# Exit
\q
```

### 3. Update .env file
Replace your DATABASE_URL in `.env`:
```env
# Use this for postgres user
DATABASE_URL="postgresql://postgres:admin123@localhost:5432/sweep_pro_dev?schema=public"

# OR use this if you created sweep_user
DATABASE_URL="postgresql://sweep_user:sweep_pass123@localhost:5432/sweep_pro_dev?schema=public"
```

### 4. Run Migrations and Seed
```bash
# Generate Prisma client
npx prisma generate

# Run migrations to create tables
npx prisma migrate dev --name init

# Seed the database
npm run prisma:seed
```

## Option 2: Use Docker PostgreSQL (Alternative)

If you have Docker installed:

### 1. Create docker-compose.yml
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    container_name: sweep-pro-db
    environment:
      POSTGRES_DB: sweep_pro_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: admin123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 2. Start Database
```bash
docker-compose up -d
```

### 3. Update .env and run migrations
Same as Option 1, steps 3 and 4.

## Option 3: Fix Neon Database Connection

If you prefer to use Neon (cloud):
1. Check if your Neon database is active at https://neon.tech
2. Make sure the connection URL is correct
3. Check if there are any network/firewall restrictions
4. Try generating a new connection string from Neon dashboard

## Verification

After setup, test the connection:
```bash
# Test database connection
npx prisma db pull

# Check if tables exist
npx prisma studio
```

Then restart your backend server and try logging in again.
