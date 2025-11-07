# Quick Migration Commands

## Run these commands in order:

### 1. Navigate to backend directory
```bash
cd backend/sweep-pro-backend
```

### 2. Generate and apply Prisma migration
```bash
npx prisma migrate dev --name add_sweepro_touch_and_lux_plans
```

### 3. Seed the database with new plans
```bash
npx prisma db seed
```

### 4. (Optional) Open Prisma Studio to verify
```bash
npx prisma studio
```

## Expected Output

After seeding, you should see:
```
✅ Database seeded successfully!
📄 Created:
- Admin user: admin@sweepro.com (password: admin123)
- Customer user: customer@sweepro.com (password: customer123)
- Maid user: maid@sweepro.com (password: maid123)
- 3 Services: Daily Cleaning, Deep Cleaning, Maintenance

- 2 Active Subscription Plans: SweepPro Touch (₹4,050/month), SweepPro Lux (₹6,800/month)
- 3 Legacy Subscription Plans: Basic, Premium, Standard (Inactive)

🆕 Creating customers with new SweepPro Touch and SweepPro Lux plans...
✅ Created SweepPro Touch subscription for touch@sweepro.com (₹4,050/month - No Buffer System)
✅ Created SweepPro Lux subscription for lux@sweepro.com (₹6,800/month - 5 Buffer Days)
```

## Test Credentials

### New Plan Users
- **Touch Plan**: touch@sweepro.com / touch123
- **Lux Plan**: lux@sweepro.com / lux123

### Legacy Users
- **Admin**: admin@sweepro.com / admin123
- **Customer**: customer@sweepro.com / customer123
- **Maid**: maid@sweepro.com / maid123

## Verify Changes

### Check Plans in Database
```bash
npx prisma studio
```
Navigate to `ServicePlan` table and verify:
- `sweepro-touch-plan` exists with `planType: TOUCH`, `hasBufferSystem: false`
- `sweepro-lux-plan` exists with `planType: LUX`, `hasBufferSystem: true`

### Test API Endpoints
```bash
# Get all plans
curl http://localhost:3000/api/subscriptions/plans

# Should return Touch and Lux plans as active
```

## Troubleshooting

### If migration fails:
```bash
# Reset database and try again
npx prisma migrate reset
npx prisma migrate dev --name add_sweepro_touch_and_lux_plans
npx prisma db seed
```

### If seed fails:
```bash
# Check for existing data conflicts
npx prisma studio
# Delete conflicting records manually, then re-run seed
npx prisma db seed
```

### Check migration status:
```bash
npx prisma migrate status
```
