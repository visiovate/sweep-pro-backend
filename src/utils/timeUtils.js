/**
 * Time Utilities - Production Ready
 * 
 * Centralized time handling for:
 * - Combining slot_date + slot_time
 * - UTC conversion
 * - Timezone-aware calculations
 */

/**
 * Combine slot_date (DATE) + slot_time (TIME) into UTC DateTime
 * 
 * @param {Date|string} slotDate - Date part (e.g., 2026-01-23)
 * @param {Date|string} slotTime - Time part (e.g., 14:30:00)
 * @param {string} timeZone - IANA timezone (default: 'UTC')
 * @returns {Date} - Combined DateTime in UTC
 */
function combineSlotDateTime(slotDate, slotTime, timeZone = 'UTC') {
  if (!slotDate || !slotTime) {
    return null;
  }

  try {
    // Parse date and time
    const dateObj = new Date(slotDate);
    const timeObj = new Date(slotTime);

    // Extract components
    const year = dateObj.getUTCFullYear();
    const month = dateObj.getUTCMonth();
    const day = dateObj.getUTCDate();
    const hours = timeObj.getUTCHours();
    const minutes = timeObj.getUTCMinutes();
    const seconds = timeObj.getUTCSeconds();

    // Combine into single DateTime (UTC)
    const combined = new Date(Date.UTC(year, month, day, hours, minutes, seconds));

    return combined;
  } catch (error) {
    console.error(`Error combining slot date/time: ${error.message}`);
    return null;
  }
}

/**
 * Get current time in UTC
 * 
 * @returns {Date} - Current UTC time
 */
function getCurrentUTC() {
  return new Date();
}

/**
 * Calculate time difference in hours
 * 
 * @param {Date} futureTime - Future time
 * @param {Date} baseTime - Base time (default: now)
 * @returns {number} - Hours difference (positive = futureTime is in the future)
 */
function getHoursDifference(futureTime, baseTime = new Date()) {
  const diffMs = futureTime.getTime() - baseTime.getTime();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Calculate assignment trigger window
 * 
 * SIMPLIFIED: Find all bookings within the next 20 hours that need assignment
 * This means: now < service_datetime <= now + 20 hours
 * 
 * @param {Date} now - Current UTC time
 * @returns {Object} - { windowStart, windowEnd }
 */
function get20HourTriggerWindow(now = getCurrentUTC()) {
  const HOURS_AHEAD = 20;

  // Window: from now to 20 hours from now
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + (HOURS_AHEAD * 60 * 60 * 1000));

  return {
    windowStart,
    windowEnd,
  };
}

/**
 * Check if a service datetime falls within the 20-hour trigger window
 * 
 * @param {Date} serviceDateTime - Combined service datetime (UTC)
 * @param {Date} now - Current UTC time (default: now)
 * @returns {boolean} - True if within trigger window
 */
function isWithin20HourWindow(serviceDateTime, now = getCurrentUTC()) {
  if (!serviceDateTime) {
    return false;
  }

  const { windowStart, windowEnd } = get20HourTriggerWindow(now);
  return serviceDateTime >= windowStart && serviceDateTime <= windowEnd;
}

/**
 * Format datetime for logging
 * 
 * @param {Date} date - Date to format
 * @returns {string} - ISO format string
 */
function formatDateTimeForLog(date) {
  if (!date) {
    return 'null';
  }
  return date.toISOString();
}

module.exports = {
  combineSlotDateTime,
  getCurrentUTC,
  getHoursDifference,
  get20HourTriggerWindow,
  isWithin20HourWindow,
  formatDateTimeForLog,
};
