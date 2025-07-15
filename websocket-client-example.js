/**
 * WebSocket Client Integration Example for Sweep Pro
 * 
 * This file demonstrates how to integrate WebSocket notifications
 * in your frontend application (React, Vue, Angular, etc.)
 */

class SweepProNotificationClient {
  constructor(wsUrl, authToken) {
    this.wsUrl = wsUrl;
    this.authToken = authToken;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.listeners = new Map();
    this.isAuthenticated = false;
    this.heartbeatInterval = null;
  }

  // Connect to WebSocket server
  connect() {
    try {
      this.ws = new WebSocket(this.wsUrl);
      
      this.ws.onopen = () => {
        console.log('Connected to notification server');
        this.reconnectAttempts = 0;
        this.authenticate();
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        this.isAuthenticated = false;
        this.stopHeartbeat();
        this.handleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      this.handleReconnect();
    }
  }

  // Authenticate with the server
  authenticate() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'auth',
        token: this.authToken
      });
    }
  }

  // Send message to server
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // Handle incoming messages
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'auth_success':
          this.isAuthenticated = true;
          console.log('Authentication successful');
          this.emit('authenticated', message.user);
          break;
          
        case 'pong':
          // Heartbeat response
          break;
          
        default:
          // Handle notification
          this.handleNotification(message);
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  // Handle different types of notifications
  handleNotification(notification) {
    console.log('Received notification:', notification);
    
    // Emit to specific listeners
    this.emit(notification.type, notification);
    this.emit('notification', notification);
    
    // Handle specific notification types
    switch (notification.type) {
      case 'USER_REGISTERED':
        this.showNotification('Welcome!', 'Your account has been created successfully');
        break;
        
      case 'BOOKING_CREATED':
        this.showNotification('Booking Confirmed', notification.message);
        break;
        
      case 'MAID_ASSIGNED':
        this.showNotification('Maid Assigned', notification.message);
        break;
        
      case 'MAID_ARRIVED':
        this.showNotification('Maid Arrived', notification.message);
        break;
        
      case 'SERVICE_STARTED':
        this.showNotification('Service Started', notification.message);
        break;
        
      case 'SERVICE_COMPLETED':
        this.showNotification('Service Completed', notification.message);
        break;
        
      case 'PAYMENT_RECEIVED':
        this.showNotification('Payment Successful', notification.message);
        break;
        
      case 'PAYMENT_FAILED':
        this.showNotification('Payment Failed', notification.message, 'error');
        break;
        
      case 'BOOKING_CANCELLED':
        this.showNotification('Booking Cancelled', notification.message, 'warning');
        break;
        
      case 'SYSTEM_MAINTENANCE':
        this.showNotification('System Maintenance', notification.message, 'warning');
        break;
        
      case 'EMERGENCY_ALERT':
        this.showNotification('Emergency Alert', notification.message, 'error');
        break;
        
      default:
        this.showNotification(notification.title, notification.message);
        break;
    }
  }

  // Show notification (implement based on your UI framework)
  showNotification(title, message, type = 'info') {
    // Example implementations:
    
    // For browser notifications:
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: message,
        icon: '/path/to/icon.png'
      });
    }
    
    // For toast notifications (you can integrate with libraries like react-toastify)
    console.log(`${type.toUpperCase()}: ${title} - ${message}`);
    
    // Emit for custom UI components
    this.emit('show-notification', { title, message, type });
  }

  // Start heartbeat to keep connection alive
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 30000); // Send ping every 30 seconds
  }

  // Stop heartbeat
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Handle reconnection
  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('Max reconnection attempts reached');
      this.emit('connection-failed');
    }
  }

  // Event listener management
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in event listener:', error);
        }
      });
    }
  }

  // Update auth token
  updateAuthToken(token) {
    this.authToken = token;
    if (this.isAuthenticated) {
      this.authenticate();
    }
  }

  // Disconnect
  disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.ws && this.ws.readyState === WebSocket.OPEN,
      authenticated: this.isAuthenticated,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

// Usage Examples:

// 1. Basic initialization
const notificationClient = new SweepProNotificationClient('ws://localhost:3000', 'your-jwt-token');

// 2. Set up event listeners
notificationClient.on('authenticated', (user) => {
  console.log('User authenticated:', user);
});

notificationClient.on('notification', (notification) => {
  console.log('New notification:', notification);
  // Update UI, show badge, etc.
});

notificationClient.on('BOOKING_CREATED', (notification) => {
  console.log('New booking:', notification.data);
  // Update booking list, show confirmation
});

notificationClient.on('MAID_ASSIGNED', (notification) => {
  console.log('Maid assigned:', notification.data);
  // Update booking details, show maid info
});

notificationClient.on('show-notification', ({ title, message, type }) => {
  // Integrate with your notification library
  // Example with react-toastify:
  // toast[type](message, { title });
});

// 3. Connect to server
notificationClient.connect();

// 4. Request notification permission (for browser notifications)
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// React Hook Example:
/*
import { useEffect, useState } from 'react';

export const useNotifications = (authToken) => {
  const [client, setClient] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (authToken) {
      const notificationClient = new SweepProNotificationClient('ws://localhost:3000', authToken);
      
      notificationClient.on('authenticated', (user) => {
        console.log('Connected as:', user.name);
      });

      notificationClient.on('notification', (notification) => {
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);
      });

      notificationClient.connect();
      setClient(notificationClient);

      return () => {
        notificationClient.disconnect();
      };
    }
  }, [authToken]);

  const markAsRead = (notificationId) => {
    // Call API to mark as read
    fetch(`/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  return {
    client,
    notifications,
    unreadCount,
    markAsRead
  };
};
*/

// Vue 3 Composition API Example:
/*
import { ref, onMounted, onUnmounted } from 'vue';

export function useNotifications(authToken) {
  const client = ref(null);
  const notifications = ref([]);
  const unreadCount = ref(0);

  onMounted(() => {
    if (authToken.value) {
      const notificationClient = new SweepProNotificationClient('ws://localhost:3000', authToken.value);
      
      notificationClient.on('notification', (notification) => {
        notifications.value.unshift(notification);
        unreadCount.value++;
      });

      notificationClient.connect();
      client.value = notificationClient;
    }
  });

  onUnmounted(() => {
    if (client.value) {
      client.value.disconnect();
    }
  });

  return {
    client,
    notifications,
    unreadCount
  };
}
*/

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SweepProNotificationClient;
}

// Or for ES6 modules:
// export default SweepProNotificationClient;
