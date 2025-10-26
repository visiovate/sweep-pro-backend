#!/usr/bin/env node

/**
 * Test database connectivity and basic queries
 */

const { PrismaClient } = require('@prisma/client');

async function testDatabase() {
  console.log('🗄️ Testing Database Connectivity');
  console.log('='.repeat(40));
  
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Connecting to database...');
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    // Test basic queries
    console.log('\n📊 Testing basic queries:');
    
    // Test user query
    try {
      const userCount = await prisma.user.count();
      console.log(`✅ Users count: ${userCount}`);
      
      const customerCount = await prisma.user.count({ where: { role: 'CUSTOMER' } });
      console.log(`✅ Customers count: ${customerCount}`);
      
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      console.log(`✅ Admins count: ${adminCount}`);
      
    } catch (error) {
      console.log(`❌ User query failed: ${error.message}`);
    }
    
    // Test customer assignment query
    try {
      const assignmentCount = await prisma.customerMaidAssignment.count();
      console.log(`✅ Customer assignments count: ${assignmentCount}`);
      
      const activeAssignments = await prisma.customerMaidAssignment.count({ 
        where: { isActive: true } 
      });
      console.log(`✅ Active assignments count: ${activeAssignments}`);
      
    } catch (error) {
      console.log(`❌ Assignment query failed: ${error.message}`);
    }
    
    // Test specific customer query (the one causing issues)
    try {
      const customerId = 'f17809e5-2a00-4003-9267-6ead85bedc15';
      console.log(`\n🔍 Testing specific customer query for ID: ${customerId}`);
      
      const customer = await prisma.user.findUnique({
        where: { id: customerId }
      });
      
      if (customer) {
        console.log(`✅ Customer found: ${customer.name} (${customer.role})`);
        
        // Test assignment query for this customer
        const assignment = await prisma.customerMaidAssignment.findFirst({
          where: {
            customerId: customerId,
            isActive: true
          },
          include: {
            customer: true,
            maid: {
              include: {
                user: true
              }
            }
          }
        });
        
        if (assignment) {
          console.log(`✅ Assignment found: ${assignment.maid.user.name}`);
        } else {
          console.log(`ℹ️ No active assignment found for this customer`);
        }
        
        // Test subscription query
        const subscription = await prisma.subscription.findFirst({
          where: {
            customer: {
              userId: customerId
            },
            status: {
              in: ['ACTIVE', 'PENDING_PAYMENT']
            }
          }
        });
        
        if (subscription) {
          console.log(`✅ Subscription found: ${subscription.status}`);
        } else {
          console.log(`ℹ️ No active subscription found for this customer`);
        }
        
      } else {
        console.log(`❌ Customer not found with ID: ${customerId}`);
      }
      
    } catch (error) {
      console.log(`❌ Specific customer query failed: ${error.message}`);
      console.log(`Error details:`, error);
    }
    
  } catch (error) {
    console.log(`❌ Database connection failed: ${error.message}`);
    console.log(`Error details:`, error);
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

testDatabase()
  .catch(error => {
    console.error('💥 Database test error:', error.message);
  });


