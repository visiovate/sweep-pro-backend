/**
 * Utility functions for parsing and handling customer time slots
 */

const { toZonedTime, fromZonedTime, formatInTimeZone } = require('date-fns-tz');

const TIMEZONE = 'Asia/Kolkata';
const ASSIGNMENT_REQUEST_HOURS_BEFORE = 20; // Send booking request 20 hours before service time

function normalizeTimeSlot(ts) {
  if (!ts || typeof ts !== 'string') return null;
  return ts.replace(/\s+/g, ''); // "09:00 - 12:00" -> "09:00-12:00"
}

function parseStartTime(timeSlot) {
  // Expect "HH:mm-HH:mm" or similar
  const normalized = normalizeTimeSlot(timeSlot);
  if (!normalized || !normalized.includes('-')) return null;
  const [start] = normalized.split('-');
  const [hh, mm = '0'] = start.split(':');
  const hour = Number(hh);
  const minute = Number(mm);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

/**
 * Returns a UTC Date for the next service start time for given slot.
 * Uses IST as the reference timezone.
 * If today's slot start is still in the future (IST), returns today at start.
 * Otherwise returns tomorrow at start.
 */
function getNextServiceDateTime(timeSlot) {
  const parsed = parseStartTime(timeSlot);
  if (!parsed) throw new Error(`Invalid timeSlot format: ${timeSlot}`);

  const nowUtc = new Date();
  const nowIst = toZonedTime(nowUtc, TIMEZONE);

  // Build candidate IST date at slot start
  const candidateIst = new Date(nowIst);
  candidateIst.setHours(parsed.hour, parsed.minute, 0, 0);

  // If the slot start is already passed (or equal), schedule for tomorrow
  let targetIst;
  if (nowIst >= candidateIst) {
    targetIst = new Date(candidateIst);
    targetIst.setDate(candidateIst.getDate() + 1);
  } else {
    targetIst = candidateIst;
  }

  // Convert the IST target instant to UTC Date and return
  const serviceUtc = fromZonedTime(targetIst, TIMEZONE);
  return serviceUtc;
}

function calculateRequestTime(serviceDateTimeUtc) {
  // if you need to compute the "request time" based on ASSIGNMENT_REQUEST_HOURS_BEFORE
  const msBefore = ASSIGNMENT_REQUEST_HOURS_BEFORE * 60 * 60 * 1000;
  return new Date(serviceDateTimeUtc.getTime() - msBefore);
}

/**
 * Check if it's time to create assignment requests for a given time slot
 * @param {string} timeSlot - Customer's time slot
 * @returns {boolean} - Whether to create requests now
 */
const shouldCreateRequestNow = (timeSlot) => {
  const nowUtc = new Date();
  const nextServiceUtc = getNextServiceDateTime(timeSlot);
  const requestUtc = calculateRequestTime(nextServiceUtc);

  const timeDiff = Math.abs(nowUtc.getTime() - requestUtc.getTime());
  const fiveMinutes = 5 * 60 * 1000;
  return timeDiff <= fiveMinutes;
};

/**
 * Check if we should send assignment requests immediately (when server starts within 20 hours of service)
 * @param {string} timeSlot - Customer's time slot
 * @returns {boolean} - Whether to send requests immediately
 */
const shouldSendRequestImmediately = (timeSlot) => {
  const nowUtc = new Date();
  const nextServiceUtc = getNextServiceDateTime(timeSlot);

  const hoursUntilService = (nextServiceUtc.getTime() - nowUtc.getTime()) / (1000 * 60 * 60);

  const idealRequestUtc = calculateRequestTime(nextServiceUtc);
  const isPastIdealRequestTime = nowUtc.getTime() > idealRequestUtc.getTime();
  const isBeforeService = nowUtc.getTime() < nextServiceUtc.getTime();

  const shouldSend = hoursUntilService <= ASSIGNMENT_REQUEST_HOURS_BEFORE &&
                    hoursUntilService > 0 &&
                    isPastIdealRequestTime &&
                    isBeforeService;

  const fmt = (d) => ({
    ist: d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    utc: d.toISOString()
  });

  console.log(`🔍 Time check for ${timeSlot}:`, {
    hoursUntilService: hoursUntilService.toFixed(2),
    isPastIdealRequestTime,
    isBeforeService,
    shouldSend,
    idealRequestTime: fmt(idealRequestUtc),
    nextService: fmt(nextServiceUtc),
    now: fmt(nowUtc)
  });

  return shouldSend;
};

/**
 * Format time slot for display
 * @param {string} timeSlot - Raw time slot
 * @returns {string} - Formatted time slot
 */
const formatTimeSlot = (timeSlot) => {
  if (!timeSlot) return 'Not specified';
  
  try {
    const hour = parseStartTime(timeSlot).hour;
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
  getNextServiceDateTime,
  calculateRequestTime,
  parseStartTime,
  ASSIGNMENT_REQUEST_HOURS_BEFORE,
  // optionally export format helper
  formatInIST: (dt) => formatInTimeZone(dt, TIMEZONE, 'dd/MM/yyyy, hh:mm:ss a'),
  shouldCreateRequestNow,
  shouldSendRequestImmediately,
  formatTimeSlot,
  getUniqueTimeSlots,
};
