/**
 * Utility functions for parsing and handling customer time slots
 */

/**
 * Parse time slot string like "12.00-1.00" to extract start hour
 * @param {string} timeSlot - Time slot in format "12.00-1.00"
 * @returns {number} - Start hour in 24-hour format
 */
const parseTimeSlot = (timeSlot) => {
  if (!timeSlot) return 9; // Default to 9 AM if no time slot

  try {
    // Handle various formats: "12.00-1.00", "12:00-1:00", "12-1", "12.00", etc.
    const cleanSlot = timeSlot.toString().trim();
    
    // Extract the first number (start time)
    const match = cleanSlot.match(/^(\d{1,2})[.:,-]?/);
    
    if (match) {
      let hour = parseInt(match[1]);
      
      // Handle 12-hour format assumptions
      // If hour is between 1-11, assume PM for common service hours
      // If hour is 12, keep as is (could be noon)
      // If hour is 0, convert to 12 (midnight)
      if (hour >= 1 && hour <= 11) {
        // For service times, 1-11 likely means PM (13-23 in 24h format)
        hour = hour + 12;
      } else if (hour === 0) {
        hour = 12; // Midnight becomes noon for services
      }
      
      // Ensure hour is within valid range (0-23)
      hour = Math.max(0, Math.min(23, hour));
      
      return hour;
    }
    
    // Fallback to 9 AM if parsing fails
    return 9;
    
  } catch (error) {
    console.error('Error parsing time slot:', timeSlot, error);
    return 9; // Default fallback
  }
};

/**
 * 🔧 CONFIGURATION: Hours before service to send assignment request
 * Change this value to modify when assignment requests are sent to maids
 */
const ASSIGNMENT_REQUEST_HOURS_BEFORE = 20;

/**
 * Calculate the request creation time (configurable hours before service time)
 * @param {Date} serviceDate - The date of service
 * @param {string} timeSlot - Customer's preferred time slot
 * @returns {Date} - When to create the assignment request
 */
const calculateRequestTime = (serviceDate, timeSlot) => {
  const serviceHour = parseTimeSlot(timeSlot);
  
  // Create service datetime
  const serviceDateTime = new Date(serviceDate);
  serviceDateTime.setHours(serviceHour, 0, 0, 0);
  
  // Calculate request time (configurable hours before)
  const requestDateTime = new Date(serviceDateTime);
  requestDateTime.setHours(requestDateTime.getHours() - ASSIGNMENT_REQUEST_HOURS_BEFORE);
  
  return requestDateTime;
};

/**
 * Get next service date for a customer based on their time slot
 * @param {string} timeSlot - Customer's preferred time slot
 * @returns {Date} - Next service date and time
 */
const getNextServiceDateTime = (timeSlot) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const serviceHour = parseTimeSlot(timeSlot);
  tomorrow.setHours(serviceHour, 0, 0, 0);
  
  return tomorrow;
};

/**
 * Check if it's time to create assignment requests for a given time slot
 * @param {string} timeSlot - Customer's time slot
 * @returns {boolean} - Whether to create requests now
 */
const shouldCreateRequestNow = (timeSlot) => {
  const now = new Date();
  const nextService = getNextServiceDateTime(timeSlot);
  const requestTime = calculateRequestTime(nextService, timeSlot);
  
  // Check if current time is within 5 minutes of request time
  const timeDiff = Math.abs(now.getTime() - requestTime.getTime());
  const fiveMinutes = 5 * 60 * 1000;
  
  return timeDiff <= fiveMinutes;
};

/**
 * Check if we should send assignment requests immediately (when server starts within 20 hours of service)
 * @param {string} timeSlot - Customer's time slot
 * @returns {boolean} - Whether to send requests immediately
 */
const shouldSendRequestImmediately = (timeSlot) => {
  const now = new Date();
  const nextService = getNextServiceDateTime(timeSlot);
  const requestTime = calculateRequestTime(nextService, timeSlot);
  
  // If current time is past the request time but before service time, send immediately
  const hoursUntilService = (nextService.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isPastRequestTime = now.getTime() > requestTime.getTime();
  const isBeforeService = now.getTime() < nextService.getTime();
  
  // Send immediately if:
  // 1. We're past the scheduled request time AND
  // 2. We're still before the service time AND
  // 3. We're within the configured hours window
  return isPastRequestTime && isBeforeService && hoursUntilService <= ASSIGNMENT_REQUEST_HOURS_BEFORE;
};

/**
 * Format time slot for display
 * @param {string} timeSlot - Raw time slot
 * @returns {string} - Formatted time slot
 */
const formatTimeSlot = (timeSlot) => {
  if (!timeSlot) return 'Not specified';
  
  try {
    const hour = parseTimeSlot(timeSlot);
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    
    return `${displayHour}:00 ${period}`;
  } catch (error) {
    return timeSlot; // Return original if formatting fails
  }
};

/**
 * Get all unique time slots from customers
 * @param {Array} customers - Array of customer objects with timeSlot property
 * @returns {Array} - Array of unique time slots
 */
const getUniqueTimeSlots = (customers) => {
  const slots = customers
    .map(customer => customer.timeSlot)
    .filter(slot => slot && slot.trim())
    .map(slot => slot.trim());
    
  return [...new Set(slots)];
};

module.exports = {
  parseTimeSlot,
  calculateRequestTime,
  getNextServiceDateTime,
  shouldCreateRequestNow,
  shouldSendRequestImmediately,
  formatTimeSlot,
  getUniqueTimeSlots,
  ASSIGNMENT_REQUEST_HOURS_BEFORE
};
