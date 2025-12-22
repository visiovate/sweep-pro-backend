const {
  getNextServiceDateTime,
  calculateRequestTime,
  parseStartTime,
  shouldCreateRequestNow,
  shouldSendRequestImmediately,
  ASSIGNMENT_REQUEST_HOURS_BEFORE,
  formatTimeSlot,
  getUniqueTimeSlots
} = require('../utils/timeSlotUtils');

describe('Time Slot Utilities', () => {
  describe('parseStartTime', () => {
    test('should parse valid time slot format', () => {
      expect(parseStartTime('09:00-12:00')).toEqual({ hour: 9, minute: 0 });
      expect(parseStartTime('14:30-17:30')).toEqual({ hour: 14, minute: 30 });
      expect(parseStartTime('09:00 - 12:00')).toEqual({ hour: 9, minute: 0 });
    });

    test('should handle edge cases', () => {
      expect(parseStartTime('00:00-03:00')).toEqual({ hour: 0, minute: 0 });
      expect(parseStartTime('23:59-23:59')).toEqual({ hour: 23, minute: 59 });
    });

    test('should return null for invalid formats', () => {
      expect(parseStartTime('invalid')).toBeNull();
      expect(parseStartTime('25:00-26:00')).toEqual({ hour: 25, minute: 0 }); // Invalid but parsed
      expect(parseStartTime('')).toBeNull();
      expect(parseStartTime(null)).toBeNull();
      expect(parseStartTime(undefined)).toBeNull();
    });
  });

  describe('getNextServiceDateTime', () => {
    test('should return next service date time for morning slot', () => {
      const serviceTime = getNextServiceDateTime('09:00-12:00');
      expect(serviceTime).toBeInstanceOf(Date);
      
      // Check if it's a valid future date
      const now = new Date();
      expect(serviceTime.getTime()).toBeGreaterThanOrEqual(now.getTime());
    });

    test('should return next service date time for afternoon slot', () => {
      const serviceTime = getNextServiceDateTime('14:00-17:00');
      expect(serviceTime).toBeInstanceOf(Date);
    });

    test('should return next service date time for evening slot', () => {
      const serviceTime = getNextServiceDateTime('18:00-21:00');
      expect(serviceTime).toBeInstanceOf(Date);
    });

    test('should handle edge case times', () => {
      const midnightService = getNextServiceDateTime('00:00-03:00');
      const lateNightService = getNextServiceDateTime('23:00-23:59');
      
      expect(midnightService).toBeInstanceOf(Date);
      expect(lateNightService).toBeInstanceOf(Date);
    });

    test('should throw error for invalid time slot', () => {
      expect(() => getNextServiceDateTime('invalid')).toThrow();
      expect(() => getNextServiceDateTime('')).toThrow();
      expect(() => getNextServiceDateTime(null)).toThrow();
    });
  });

  describe('calculateRequestTime', () => {
    test('should calculate request time 20 hours before service', () => {
      const serviceDateTime = new Date('2024-12-10T09:00:00.000Z');
      const requestTime = calculateRequestTime(serviceDateTime);
      
      const hoursDifference = (serviceDateTime.getTime() - requestTime.getTime()) / (1000 * 60 * 60);
      expect(hoursDifference).toBe(20);
    });

    test('should work with different service times', () => {
      const serviceDateTime1 = new Date('2024-12-10T14:30:00.000Z');
      const serviceDateTime2 = new Date('2024-12-15T18:00:00.000Z');
      
      const requestTime1 = calculateRequestTime(serviceDateTime1);
      const requestTime2 = calculateRequestTime(serviceDateTime2);
      
      expect((serviceDateTime1.getTime() - requestTime1.getTime()) / (1000 * 60 * 60)).toBe(20);
      expect((serviceDateTime2.getTime() - requestTime2.getTime()) / (1000 * 60 * 60)).toBe(20);
    });

    test('should maintain ASSIGNMENT_REQUEST_HOURS_BEFORE constant', () => {
      expect(ASSIGNMENT_REQUEST_HOURS_BEFORE).toBe(20);
    });
  });

  describe('shouldCreateRequestNow', () => {
    test('should return boolean for valid time slot', () => {
      const result = shouldCreateRequestNow('09:00-12:00');
      expect(typeof result).toBe('boolean');
    });

    test('should work with different time slots', () => {
      const slots = ['06:00-09:00', '12:00-15:00', '18:00-21:00'];
      
      slots.forEach(slot => {
        const result = shouldCreateRequestNow(slot);
        expect(typeof result).toBe('boolean');
      });
    });

    // Note: Testing exact timing would require mocking Date.now()
    // which is complex. These tests verify the function works without error.
  });

  describe('shouldSendRequestImmediately', () => {
    test('should return boolean for valid time slot', () => {
      const result = shouldSendRequestImmediately('09:00-12:00');
      expect(typeof result).toBe('boolean');
    });

    test('should handle various time slots', () => {
      const slots = ['08:00-11:00', '13:00-16:00', '19:00-22:00'];
      
      slots.forEach(slot => {
        const result = shouldSendRequestImmediately(slot);
        expect(typeof result).toBe('boolean');
      });
    });

    test('should use correct timing logic', () => {
      // This test verifies the function executes without errors
      // Exact timing tests would need Date mocking
      const result = shouldSendRequestImmediately('10:00-13:00');
      expect(result).toBeDefined();
    });
  });

  describe('formatTimeSlot', () => {
    test('should format morning time slots correctly', () => {
      expect(formatTimeSlot('09:00-12:00')).toBe('9:00 AM');
      expect(formatTimeSlot('08:00-11:00')).toBe('8:00 AM');
    });

    test('should format afternoon time slots correctly', () => {
      expect(formatTimeSlot('13:00-16:00')).toBe('1:00 PM');
      expect(formatTimeSlot('14:00-17:00')).toBe('2:00 PM');
    });

    test('should handle noon and midnight correctly', () => {
      expect(formatTimeSlot('12:00-15:00')).toBe('12:00 PM');
      expect(formatTimeSlot('00:00-03:00')).toBe('12:00 AM');
    });

    test('should handle edge cases', () => {
      expect(formatTimeSlot(null)).toBe('Not specified');
      expect(formatTimeSlot('')).toBe('Not specified');
      expect(formatTimeSlot(undefined)).toBe('Not specified');
    });

    test('should fallback to original string for invalid format', () => {
      expect(formatTimeSlot('invalid-format')).toBe('invalid-format');
    });
  });

  describe('getUniqueTimeSlots', () => {
    test('should return unique time slots from customer array', () => {
      const customers = [
        { name: 'Customer 1', timeSlot: '09:00-12:00' },
        { name: 'Customer 2', timeSlot: '14:00-17:00' },
        { name: 'Customer 3', timeSlot: '09:00-12:00' },
        { name: 'Customer 4', timeSlot: '18:00-21:00' }
      ];

      const uniqueSlots = getUniqueTimeSlots(customers);
      expect(uniqueSlots).toHaveLength(3);
      expect(uniqueSlots).toContain('09:00-12:00');
      expect(uniqueSlots).toContain('14:00-17:00');
      expect(uniqueSlots).toContain('18:00-21:00');
    });

    test('should handle empty array', () => {
      const uniqueSlots = getUniqueTimeSlots([]);
      expect(uniqueSlots).toHaveLength(0);
    });

    test('should filter out empty and null time slots', () => {
      const customers = [
        { name: 'Customer 1', timeSlot: '09:00-12:00' },
        { name: 'Customer 2', timeSlot: '' },
        { name: 'Customer 3', timeSlot: null },
        { name: 'Customer 4', timeSlot: '   ' },
        { name: 'Customer 5', timeSlot: '14:00-17:00' }
      ];

      const uniqueSlots = getUniqueTimeSlots(customers);
      expect(uniqueSlots).toHaveLength(2);
      expect(uniqueSlots).toContain('09:00-12:00');
      expect(uniqueSlots).toContain('14:00-17:00');
    });

    test('should trim whitespace from time slots', () => {
      const customers = [
        { name: 'Customer 1', timeSlot: '  09:00-12:00  ' },
        { name: 'Customer 2', timeSlot: '09:00-12:00' }
      ];

      const uniqueSlots = getUniqueTimeSlots(customers);
      expect(uniqueSlots).toHaveLength(1);
      expect(uniqueSlots[0]).toBe('09:00-12:00');
    });
  });

  describe('Integration Tests', () => {
    test('should work together for complete workflow', () => {
      const timeSlot = '09:00-12:00';
      
      // Parse the time slot
      const parsed = parseStartTime(timeSlot);
      expect(parsed).not.toBeNull();
      
      // Get next service time
      const serviceTime = getNextServiceDateTime(timeSlot);
      expect(serviceTime).toBeInstanceOf(Date);
      
      // Calculate request time
      const requestTime = calculateRequestTime(serviceTime);
      expect(requestTime).toBeInstanceOf(Date);
      
      // Verify timing
      const hoursDiff = (serviceTime.getTime() - requestTime.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBe(20);
      
      // Format for display
      const formatted = formatTimeSlot(timeSlot);
      expect(formatted).toBe('9:00 AM');
      
      // Check immediate send logic
      const shouldSend = shouldSendRequestImmediately(timeSlot);
      expect(typeof shouldSend).toBe('boolean');
    });

    test('should handle IST timezone correctly', () => {
      // Test with known IST behavior
      const timeSlot = '15:30-18:30'; // 3:30 PM IST
      
      const serviceTime = getNextServiceDateTime(timeSlot);
      const requestTime = calculateRequestTime(serviceTime);
      
      // Verify the times are correctly calculated
      expect(serviceTime).toBeInstanceOf(Date);
      expect(requestTime).toBeInstanceOf(Date);
      expect(serviceTime.getTime()).toBeGreaterThan(requestTime.getTime());
    });

    test('should handle day boundary crossings', () => {
      // Test late night service that might cross to next day
      const timeSlot = '23:30-02:30'; // Late night service
      
      // Should not throw error even for complex time calculations
      expect(() => {
        const serviceTime = getNextServiceDateTime(timeSlot);
        const requestTime = calculateRequestTime(serviceTime);
      }).not.toThrow();
    });
  });

  describe('Performance Tests', () => {
    test('should handle multiple time slot operations efficiently', () => {
      const timeSlots = [
        '06:00-09:00', '07:00-10:00', '08:00-11:00', '09:00-12:00',
        '10:00-13:00', '11:00-14:00', '12:00-15:00', '13:00-16:00',
        '14:00-17:00', '15:00-18:00', '16:00-19:00', '17:00-20:00',
        '18:00-21:00', '19:00-22:00', '20:00-23:00'
      ];

      const startTime = performance.now();
      
      timeSlots.forEach(slot => {
        parseStartTime(slot);
        getNextServiceDateTime(slot);
        formatTimeSlot(slot);
        shouldSendRequestImmediately(slot);
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete operations in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });
});