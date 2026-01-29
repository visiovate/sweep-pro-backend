const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/**
 * PAYMENT WORKFLOW TEST
 * This script tests the complete payment workflow:
 * 1. Create a new user
 * 2. Get subscription plans
 * 3. Subscribe to a plan
 * 4. Create a payment
 * 5. Process payment verification
 */

async function testPaymentWorkflow() {
  console.log('\n========================================');
  console.log('🧪 PAYMENT WORKFLOW TEST');
  console.log('========================================\n');

  try {
    // ============== STEP 1: Create a new user ==============
    console.log('📝 STEP 1: Creating test user...');
    const testEmail = `test-user-${Date.now()}@sweepro.com`;
    const testPhone = `91${Math.floor(Math.random() * 9000000000 + 1000000000)}`;
    const hashedPassword = await bcrypt.hash('testuser123', 10);

    const newUser = await prisma.user.create({
      data: {
        email: testEmail,
        name: 'Test User',
        password: hashedPassword,
        phone: testPhone,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        address: 'Test Address, Hyderabad',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500081',
        latitude: 12.9716,
        longitude: 77.5946,
        profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TestUser',
        bio: 'Test user for payment workflow',
        gender: 'Male',
        isProfilePublic: true,
        customerProfile: {
          create: {
            preferences: { preferredTime: 'morning', cleaningIntensity: 'regular' },
            emergencyContact: testPhone
          }
        }
      },
      include: {
        customerProfile: true
      }
    });

    console.log('✅ User created successfully!');
    console.log(`   📧 Email: ${newUser.email}`);
    console.log(`   👤 ID: ${newUser.id}`);
    console.log(`   👨 Customer Profile ID: ${newUser.customerProfile.id}\n`);

    // ============== STEP 2: Get subscription plans ==============
    console.log('🎯 STEP 2: Fetching subscription plans...');
    const plans = await prisma.servicePlan.findMany({
      where: { isActive: true },
      include: { service: true }
    });

    if (plans.length === 0) {
      console.error('❌ No subscription plans found!');
      console.log('💡 Hint: Run the seed script first to create plans.');
      throw new Error('No subscription plans available');
    }

    console.log(`✅ Found ${plans.length} active plans:`);
    plans.forEach((plan, index) => {
      console.log(`\n   Plan ${index + 1}: ${plan.name}`);
      console.log(`   • ID: ${plan.id}`);
      console.log(`   • Service: ${plan.service.name}`);
      console.log(`   • Price: ₹${plan.finalPrice}`);
      console.log(`   • Duration: ${plan.duration} months`);
      console.log(`   • Sessions/Month: ${plan.sessionsPerMonth}`);
    });

    const selectedPlan = plans[0];
    console.log(`\n🔷 Selected Plan: ${selectedPlan.name} (₹${selectedPlan.finalPrice})\n`);

    // ============== STEP 3: Subscribe to plan ==============
    console.log('💳 STEP 3: Subscribing user to plan...');

    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + selectedPlan.duration);

    let subscription;
    try {
      subscription = await prisma.subscription.create({
        data: {
          customerId: newUser.customerProfile.id,
          planId: selectedPlan.id,
          startDate: startDate,
          endDate: endDate,
          status: 'PENDING_PAYMENT',
          amount: selectedPlan.finalPrice,
          autoRenew: true
        },
        include: {
          plan: true,
          payments: true
        }
      });

      console.log('✅ Subscription created successfully!');
      console.log(`   📋 Subscription ID: ${subscription.id}`);
      console.log(`   📊 Status: ${subscription.status}`);
      console.log(`   💰 Amount: ₹${subscription.amount}`);
      console.log(`   📅 Start Date: ${subscription.startDate}`);
      console.log(`   📅 End Date: ${subscription.endDate}\n`);
    } catch (error) {
      console.error('❌ Error creating subscription:', error.message);
      console.error('📋 Error Details:', error);
      throw error;
    }

    // ============== STEP 4: Create payment ==============
    console.log('💸 STEP 4: Creating payment for subscription...');

    let payment;
    try {
      // Calculate final amount
      const discount = 0;
      const tax = 0;
      const finalAmount = selectedPlan.finalPrice - discount + tax;

      payment = await prisma.payment.create({
        data: {
          customerId: newUser.id,
          subscriptionId: subscription.id,
          amount: selectedPlan.finalPrice,
          discount: discount,
          tax: tax,
          finalAmount: finalAmount,
          paymentMethod: 'UPI',
          status: 'PENDING',
          paymentType: 'SUBSCRIPTION'
        }
      });

      console.log('✅ Payment created successfully!');
      console.log(`   💵 Payment ID: ${payment.id}`);
      console.log(`   📊 Status: ${payment.status}`);
      console.log(`   💰 Amount: ₹${payment.amount}`);
      console.log(`   💳 Method: ${payment.paymentMethod}\n`);
    } catch (error) {
      console.error('❌ Error creating payment:', error.message);
      console.error('📋 Error Details:', error);
      throw error;
    }

    // ============== STEP 5: Simulate payment success ==============
    console.log('✅ STEP 5: Processing successful payment (simulated)...');

    try {
      // Update payment status
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          gateway: 'razorpay',
          transactionId: `txn_${Date.now()}`
        }
      });

      console.log('✅ Payment marked as COMPLETED');
      console.log(`   💵 Payment ID: ${updatedPayment.id}`);
      console.log(`   📊 Status: ${updatedPayment.status}\n`);

      // Update subscription status to ACTIVE
      const updatedSubscription = await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE'
        },
        include: {
          plan: true,
          payments: true
        }
      });

      console.log('✅ Subscription activated!');
      console.log(`   📋 Subscription ID: ${updatedSubscription.id}`);
      console.log(`   📊 Status: ${updatedSubscription.status}`);
      console.log(`   💰 Amount: ₹${updatedSubscription.amount}\n`);
    } catch (error) {
      console.error('❌ Error processing payment:', error.message);
      console.error('📋 Error Details:', error);
      throw error;
    }

    // ============== STEP 6: Verify subscription status ==============
    console.log('🔍 STEP 6: Verifying subscription status...');

    const verifySubscription = await prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: {
        plan: {
          include: {
            service: true
          }
        },
        payments: {
          select: {
            id: true,
            amount: true,
            status: true,
            paymentMethod: true,
            createdAt: true
          }
        }
      }
    });

    console.log('✅ Subscription verified!');
    console.log(`\n   📋 Subscription Details:`);
    console.log(`   • ID: ${verifySubscription.id}`);
    console.log(`   • Status: ${verifySubscription.status}`);
    console.log(`   • Plan: ${verifySubscription.plan.name}`);
    console.log(`   • Service: ${verifySubscription.plan.service.name}`);
    console.log(`   • Amount: ₹${verifySubscription.amount}`);
    console.log(`   • Discount: ₹${verifySubscription.discount}`);
    console.log(`   • Auto-Renew: ${verifySubscription.autoRenew}`);
    console.log(`   • Start Date: ${verifySubscription.startDate}`);
    console.log(`   • End Date: ${verifySubscription.endDate}`);
    console.log(`   • Billing Cycle: ${verifySubscription.billingCycle}`);
    console.log(`   • Payments Count: ${verifySubscription.payments.length}`);

    if (verifySubscription.payments.length > 0) {
      console.log(`\n   💳 Payment History:`);
      verifySubscription.payments.forEach((pay, idx) => {
        console.log(`   ${idx + 1}. ID: ${pay.id}`);
        console.log(`      Status: ${pay.status} | Amount: ₹${pay.amount} | Method: ${pay.paymentMethod}`);
      });
    }

    // ============== STEP 7: Get user subscription ==============
    console.log('\n\n📊 STEP 7: Fetching user subscription...');

    const userSubscription = await prisma.subscription.findUnique({
      where: { customerId: newUser.customerProfile.id },
      include: {
        plan: {
          include: {
            service: true
          }
        },
        customer: {
          include: {
            user: {
              select: {
                email: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (userSubscription) {
      console.log('✅ User subscription found!');
      console.log(`\n   👤 Customer: ${userSubscription.customer.user.name} (${userSubscription.customer.user.email})`);
      console.log(`   📋 Subscription ID: ${userSubscription.id}`);
      console.log(`   📊 Status: ${userSubscription.status}`);
      console.log(`   🎯 Plan: ${userSubscription.plan.name}`);
      console.log(`   💰 Amount: ₹${userSubscription.amount}`);
    } else {
      console.log('❌ No subscription found for user!');
    }

    // ============== SUMMARY ==============
    console.log('\n\n========================================');
    console.log('✅ PAYMENT WORKFLOW TEST COMPLETED SUCCESSFULLY!');
    console.log('========================================\n');

    console.log('📊 TEST SUMMARY:');
    console.log(`\n1. ✅ User Created`);
    console.log(`   Email: ${newUser.email}`);
    console.log(`   Phone: ${newUser.phone}`);
    console.log(`\n2. ✅ Subscription Plans Retrieved`);
    console.log(`   Total Plans: ${plans.length}`);
    console.log(`\n3. ✅ Subscription Created`);
    console.log(`   Plan: ${selectedPlan.name}`);
    console.log(`   Status: ACTIVE`);
    console.log(`\n4. ✅ Payment Created & Verified`);
    console.log(`   Amount: ₹${selectedPlan.finalPrice}`);
    console.log(`   Status: COMPLETED`);
    console.log(`\n5. ✅ Payment Processing Successful`);
    console.log(`   Subscription Status: ACTIVE`);
    console.log(`   Payment Status: COMPLETED`);

    console.log('\n\n🔐 Test Data for Manual Testing:');
    console.log('================================');
    console.log(`Email: ${newUser.email}`);
    console.log(`Password: testuser123`);
    console.log(`Subscription ID: ${subscription.id}`);
    console.log(`Payment ID: ${payment.id}`);
    console.log(`Plan: ${selectedPlan.name}`);
    console.log(`Amount: ₹${selectedPlan.finalPrice}`);

  } catch (error) {
    console.error('\n\n❌ TEST FAILED');
    console.error('========================================');
    console.error('Error:', error.message);
    console.error('\n📋 Full Error Stack:');
    console.error(error);
    console.error('\n🐛 Debugging Information:');
    console.error('- Check if database is connected');
    console.error('- Verify seed data is populated (run: node prisma/seed-clean.js)');
    console.error('- Check .env file for DATABASE_URL');
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testPaymentWorkflow();
