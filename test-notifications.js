#!/usr/bin/env node

/**
 * Comprehensive Notification System Test Script
 * 
 * This script tests all the notification integrations in the Sweep Pro backend
 * to ensure they work correctly after the subscription-only service changes.
 */

const WebSocket = require('ws');
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';

class NotificationTester {
  constructor() {
    this.authToken = null;
    this.userId = null;
    this.customerId = null;
    this.maidId = null;
    this.adminId = null;
    this.serviceId = null;
    this.subscriptionId = null;
    this.bookingId = null;
    this.paymentId = null;
    this.ws = null;
    this.notifications = [];
  }

  async setupWebSocketConnection() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      
      this.ws.on('open', () => {
        console.log('✅ WebSocket connection established');
        
        // Authenticate with the server
        this.ws.send(JSON.stringify({
          type: 'auth',
          token: this.authToken
        }));
        
        this.ws.on('message', (data) => {
          const message = JSON.parse(data);
          
          if (message.type === 'auth_success') {
            console.log('✅ WebSocket authentication successful');
            resolve();
          } else if (message.type !== 'pong') {
            console.log('🔔 Notification received:', message);
            this.notifications.push(message);
          }
        });
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log('🔌 WebSocket connection closed');
      });
    });
  }

  async apiRequest(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async loginAsAdmin() {
    console.log('\n🔐 Logging in as admin...');
    const response = await this.apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@sweepro.com',
        password: 'admin123'
      })
    });
    
    this.authToken = response.token;
    this.adminId = response.user.id;
    console.log('✅ Admin login successful');
  }

  async loginAsCustomer() {
    console.log('\n🔐 Logging in as customer...');
    const response = await this.apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'customer@sweepro.com',
        password: 'customer123'
      })
    });
    
    this.authToken = response.token;
    this.customerId = response.user.id;
    console.log('✅ Customer login successful');
  }

  async getServices() {
    console.log('\n📋 Getting services...');
    const services = await this.apiRequest('/api/services');
    if (services.length > 0) {
      this.serviceId = services[0].id;
      console.log('✅ Service found:', services[0].name);
    } else {
      console.log('⚠️  No services found');
    }
  }

  async testUserRegistrationNotification() {
    console.log('\n🧪 Testing user registration notification...');
    
    const testUser = {
      name: 'Test User ' + Date.now(),
      email: `testuser${Date.now()}@sweepro.com`,
      password: 'test123',
      phone: '9999999999',
      address: 'Test Address',
      role: 'CUSTOMER'
    };

    const response = await this.apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(testUser)
    });

    console.log('✅ User registration successful');
    return response;
  }

  async testSubscriptionCreation() {
    console.log('\n🧪 Testing subscription creation...');
    
    // First get subscription plans
    const plans = await this.apiRequest('/api/subscriptions/plans');
    if (plans.length === 0) {
      console.log('⚠️  No subscription plans found');
      return;
    }
    
    const planId = plans[0].id;
    console.log('📋 Using plan:', plans[0].name);
    
    // Subscribe to plan
    const subscriptionResponse = await this.apiRequest('/api/subscriptions/subscribe', {
      method: 'POST',
      body: JSON.stringify({ planId })
    });
    
    this.subscriptionId = subscriptionResponse.data.id;
    console.log('✅ Subscription created successfully');
    
    // Complete subscription payment (simulate)
    const paymentResponse = await this.apiRequest('/api/subscriptions/complete-payment', {
      method: 'POST',
      body: JSON.stringify({
        subscriptionId: this.subscriptionId,
        paymentId: 'test-payment-id',
        transactionId: 'test-txn-' + Date.now(),
        gateway: 'razorpay'
      })
    });
    
    console.log('✅ Subscription payment completed');
    return subscriptionResponse;
  }

  async testBookingCreation() {
    console.log('\n🧪 Testing booking creation (subscription-only)...');
    
    if (!this.serviceId) {
      console.log('⚠️  No service ID available');
      return;
    }
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const bookingData = {
      serviceId: this.serviceId,
      scheduledDate: tomorrow.toISOString().split('T')[0],
      scheduledTime: '10:00',
      address: '123 Test Street, Test City',
      notes: 'Test booking for notification testing'
    };
    
    const response = await this.apiRequest('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(bookingData)
    });
    
    this.bookingId = response.data.booking.id;
    console.log('✅ Booking created successfully');
    return response;
  }

  async testMaidAssignment() {
    console.log('\n🧪 Testing maid assignment...');
    
    if (!this.bookingId) {
      console.log('⚠️  No booking ID available');
      return;
    }
    
    // Login as admin first
    await this.loginAsAdmin();
    await this.setupWebSocketConnection();
    
    // Get a maid user
    const maidResponse = await this.apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'maid@sweepro.com',
        password: 'maid123'
      })
    });
    
    this.maidId = maidResponse.user.id;
    
    // Assign maid to booking
    const response = await this.apiRequest(`/api/bookings/${this.bookingId}/assign`, {
      method: 'PUT',
      body: JSON.stringify({ maidId: this.maidId })
    });
    
    console.log('✅ Maid assigned successfully');
    return response;
  }

  async testBookingStatusUpdates() {
    console.log('\n🧪 Testing booking status updates...');
    
    if (!this.bookingId) {
      console.log('⚠️  No booking ID available');
      return;
    }
    
    const statuses = ['IN_PROGRESS', 'COMPLETED'];
    
    for (const status of statuses) {
      console.log(`📝 Updating booking status to: ${status}`);
      
      const response = await this.apiRequest(`/api/bookings/${this.bookingId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      
      console.log(`✅ Status updated to ${status}`);
      
      // Wait a bit to see the notification
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async testPaymentNotifications() {
    console.log('\n🧪 Testing payment notifications...');
    
    if (!this.bookingId) {
      console.log('⚠️  No booking ID available');
      return;
    }
    
    // Create a payment
    const paymentData = {
      bookingId: this.bookingId,
      amount: 500,
      paymentMethod: 'CARD',
      gateway: 'razorpay',
      transactionId: 'test_txn_' + Date.now()
    };
    
    const paymentResponse = await this.apiRequest('/api/payments', {
      method: 'POST',
      body: JSON.stringify(paymentData)
    });
    
    this.paymentId = paymentResponse.id;
    console.log('✅ Payment created');
    
    // Test payment completion
    const completionResponse = await this.apiRequest(`/api/payments/${this.paymentId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'COMPLETED',
        transactionId: 'test_txn_completed_' + Date.now()
      })
    });
    
    console.log('✅ Payment completed');
    
    // Test payment failure
    const failureResponse = await this.apiRequest(`/api/payments/${this.paymentId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'FAILED',
        transactionId: 'test_txn_failed_' + Date.now()
      })
    });
    
    console.log('✅ Payment failure tested');
  }

  async testAdminNotifications() {
    console.log('\n🧪 Testing admin notifications...');
    
    // Test broadcast notification
    const broadcastData = {
      type: 'SYSTEM_ALERT',
      title: 'Test Broadcast',
      message: 'This is a test broadcast notification',
      data: { priority: 'MEDIUM' }
    };
    
    const broadcastResponse = await this.apiRequest('/api/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(broadcastData)
    });
    
    console.log('✅ Broadcast notification sent');
    
    // Test maintenance notification
    const maintenanceData = {
      startTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      endTime: new Date(Date.now() + 7200000).toISOString(),   // 2 hours from now
      description: 'Test maintenance notification'
    };
    
    const maintenanceResponse = await this.apiRequest('/api/notifications/maintenance', {
      method: 'POST',
      body: JSON.stringify(maintenanceData)
    });
    
    console.log('✅ Maintenance notification sent');
    
    // Test emergency alert
    const emergencyData = {
      alertType: 'SYSTEM_TEST',
      message: 'This is a test emergency alert',
      priority: 'HIGH'
    };
    
    const emergencyResponse = await this.apiRequest('/api/notifications/emergency', {
      method: 'POST',
      body: JSON.stringify(emergencyData)
    });
    
    console.log('✅ Emergency alert sent');
  }

  async testNotificationManagement() {
    console.log('\n🧪 Testing notification management...');
    
    // Login as customer to test notification retrieval
    await this.loginAsCustomer();
    await this.setupWebSocketConnection();
    
    // Get notifications
    const notifications = await this.apiRequest('/api/notifications?limit=10');
    console.log(`✅ Retrieved ${notifications.notifications.length} notifications`);
    
    // Get unread notifications
    const unreadNotifications = await this.apiRequest('/api/notifications/unread');
    console.log(`✅ Retrieved ${unreadNotifications.length} unread notifications`);
    
    // Mark all as read
    await this.apiRequest('/api/notifications/read-all', {
      method: 'PATCH'
    });
    console.log('✅ Marked all notifications as read');
  }

  async testNotificationStatistics() {
    console.log('\n🧪 Testing notification statistics...');
    
    // Login as admin for statistics
    await this.loginAsAdmin();
    await this.setupWebSocketConnection();
    
    // Get statistics
    const stats = await this.apiRequest('/api/notifications/stats?timeframe=24h');
    console.log('✅ Notification statistics retrieved:', {
      total: stats.totalNotifications,
      sent: stats.sentNotifications,
      readRate: stats.readRate + '%'
    });
    
    // Get WebSocket health
    const health = await this.apiRequest('/api/notifications/health');
    console.log('✅ WebSocket health check:', health.status);
  }

  async runAllTests() {
    console.log('🚀 Starting comprehensive notification system tests...\n');
    
    try {
      // Setup phase
      await this.loginAsAdmin();
      await this.setupWebSocketConnection();
      await this.getServices();
      
      // User tests
      await this.testUserRegistrationNotification();
      
      // Switch to customer for booking tests
      await this.loginAsCustomer();
      await this.setupWebSocketConnection();
      
      // Subscription tests
      await this.testSubscriptionCreation();
      
      // Booking tests
      await this.testBookingCreation();
      await this.testMaidAssignment();
      await this.testBookingStatusUpdates();
      
      // Payment tests
      await this.testPaymentNotifications();
      
      // Admin tests
      await this.loginAsAdmin();
      await this.setupWebSocketConnection();
      await this.testAdminNotifications();
      
      // Management tests
      await this.testNotificationManagement();
      await this.testNotificationStatistics();
      
      console.log('\n🎉 All notification tests completed successfully!');
      console.log(`📊 Total notifications received: ${this.notifications.length}`);
      
      // Show notification summary
      const notificationTypes = {};
      this.notifications.forEach(n => {
        notificationTypes[n.type] = (notificationTypes[n.type] || 0) + 1;
      });
      
      console.log('\n📋 Notification types received:');
      Object.entries(notificationTypes).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    } finally {
      if (this.ws) {
        this.ws.close();
      }
    }
  }
}

// Run the tests
if (require.main === module) {
  const tester = new NotificationTester();
  tester.runAllTests().catch(console.error);
}

module.exports = NotificationTester;
