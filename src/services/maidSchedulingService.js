const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const notificationService = require('./notificationService');

const prisma = getPrismaClient();

class MaidSchedulingService {
  constructor() {
    this.ASSIGNMENT_RADIUS_KM = 5.0;
    this.MAX_DAILY_ASSIGNMENTS = 8;
  }

  /**
   * Assign available maids to confirmed bookings
   * Takes into account buffer periods and subscription-based bookings
   * @param {Object} options - Scheduling options
   * @returns {Promise<Array>} Array of assignments made
   */
  async scheduleAndAssignMaids(options = {}) {
    const { date = new Date(), forceReassign = false } = options;
    
    try {
      console.log(`🔄 Starting maid scheduling for ${date.toDateString()}`);
      
      // Get confirmed bookings that need maid assignment
      const unassignedBookings = await this.getUnassignedBookings(date);
      
      console.log(`📋 Found ${unassignedBookings.length} unassigned bookings`);
      
      const assignments = [];
      
      for (const booking of unassignedBookings) {
        try {
          // Skip bookings during active buffer periods
          if (await this.isBookingInBufferPeriod(booking)) {
            console.log(`⏸️ Skipping booking ${booking.id} - customer in buffer period`);
            continue;
          }
          
          const assignedMaid = await this.assignBestMaidToBooking(booking);
          
          if (assignedMaid) {
            assignments.push({
              bookingId: booking.id,
              maidId: assignedMaid.id,
              maidName: assignedMaid.name,
              customerName: booking.customer.name,
              serviceName: booking.service.name,
              scheduledAt: booking.scheduledAt
            });
            
            console.log(`✅ Assigned ${assignedMaid.name} to booking ${booking.id}`);
          } else {
            console.log(`❌ No available maid found for booking ${booking.id}`);
            
            // Notify admin about unassigned booking
            await this.notifyAdminAboutUnassignedBooking(booking);
          }
        } catch (error) {
          console.error(`❌ Error assigning maid to booking ${booking.id}:`, error);
        }
      }
      
      console.log(`✅ Maid scheduling completed. Made ${assignments.length} assignments.`);
      return assignments;
      
    } catch (error) {
      console.error('❌ Error in maid scheduling:', error);
      throw error;
    }
  }

  /**
   * Get unassigned bookings for a specific date
   * @param {Date} date - Date to check for bookings
   * @returns {Promise<Array>} Unassigned bookings
   */
  async getUnassignedBookings(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    return await getPrismaClient().booking.findMany({
      where: {
        scheduledAt: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: 'CONFIRMED',
        maidId: null // No maid assigned yet
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            latitude: true,
            longitude: true
          }
        },
        service: {
          select: {
            id: true,
            name: true,
            baseDuration: true,
            category: true
          }
        }
      },
      orderBy: [
        { priority: 'desc' }, // High priority first
        { createdAt: 'asc' }   // First come, first served
      ]
    });
  }

  /**
   * Check if a booking is during an active buffer period
   * @param {Object} booking - Booking object
   * @returns {Promise<boolean>} True if booking is in buffer period
   */
  async isBookingInBufferPeriod(booking) {
    try {
      // Check if customer has active subscription in buffer period
      const customerProfile = await getPrismaClient().customerProfile.findFirst({
        where: { userId: booking.customerId },
        include: {
          subscription: {
            where: {
              status: 'ACTIVE',
              isInBufferPeriod: true
            }
          }
        }
      });
      
      return customerProfile?.subscription?.isInBufferPeriod || false;
    } catch (error) {
      console.error('Error checking buffer period status:', error);
      return false;
    }
  }

  /**
   * Find and assign the best available maid to a booking
   * @param {Object} booking - Booking object
   * @returns {Promise<Object|null>} Assigned maid or null
   */
  async assignBestMaidToBooking(booking) {
    try {
      // Get available maids for this booking
      const availableMaids = await this.getAvailableMaids(booking);
      
      if (availableMaids.length === 0) {
        return null;
      }
      
      // Rank maids by suitability
      const rankedMaids = await this.rankMaidsBySuitability(booking, availableMaids);
      
      // Assign the best maid
      const bestMaid = rankedMaids[0];
      
      const updatedBooking = await getPrismaClient().booking.update({
        where: { id: booking.id },
        data: {
          maidId: bestMaid.id,
          status: 'ASSIGNED'
        },
        include: {
          maid: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true
            }
          },
          customer: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          service: true
        }
      });
      
      // Send notifications
      await notificationService.notifyMaidAssigned(updatedBooking);
      
      // Update maid's daily booking count
      await this.updateMaidBookingCount(bestMaid.id, booking.scheduledAt);
      
      return bestMaid;
    } catch (error) {
      console.error('Error assigning maid to booking:', error);
      return null;
    }
  }

  /**
   * Get available maids for a specific booking
   * @param {Object} booking - Booking object
   * @returns {Promise<Array>} Available maids
   */
  async getAvailableMaids(booking) {
    const bookingDate = booking.scheduledAt;
    const dayOfWeek = bookingDate.toLocaleDateString('en-US', { weekday: 'monday' });
    
    return await getPrismaClient().user.findMany({
      where: {
        role: { in: ['MAID', 'FLOATING_MAID'] },
        status: 'ACTIVE',
        maidProfile: {
          status: 'ACTIVE',
          // Check service radius if customer has location
          ...(booking.customer.latitude && booking.customer.longitude && {
            serviceRadius: {
              gte: this.calculateDistance(
                booking.customer.latitude,
                booking.customer.longitude,
                { latitude: 0, longitude: 0 } // Will be calculated in ranking
              )
            }
          })
        }
      },
      include: {
        maidProfile: {
          include: {
            attendance: {
              where: {
                date: {
                  gte: new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate()),
                  lt: new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate() + 1)
                }
              }
            }
          }
        },
        maidBookings: {
          where: {
            scheduledAt: {
              gte: new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate()),
              lt: new Date(bookingDate.getFullYear(), bookingDate.getMonth(), bookingDate.getDate() + 1)
            },
            status: { in: ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] }
          }
        }
      }
    });
  }

  /**
   * Rank maids by suitability for a booking
   * @param {Object} booking - Booking object
   * @param {Array} maids - Available maids
   * @returns {Promise<Array>} Ranked maids (best first)
   */
  async rankMaidsBySuitability(booking, maids) {
    const rankedMaids = [];
    
    for (const maid of maids) {
      let score = 0;
      
      // Base score
      score += 100;
      
      // Rating score (0-50 points)
      if (maid.maidProfile.rating) {
        score += (maid.maidProfile.rating / 5) * 50;
      }
      
      // Experience score (0-30 points)
      const completedBookings = maid.maidProfile.completedBookings || 0;
      score += Math.min(completedBookings / 10, 3) * 10;
      
      // Workload score (0-40 points) - prefer less busy maids
      const dailyBookings = maid.maidBookings.length;
      const maxBookings = maid.maidProfile.maxDailyBookings || this.MAX_DAILY_ASSIGNMENTS;
      const workloadRatio = dailyBookings / maxBookings;
      score += Math.max(0, (1 - workloadRatio) * 40);
      
      // Distance score (0-30 points) - prefer closer maids
      if (booking.customer.latitude && booking.customer.longitude && 
          maid.latitude && maid.longitude) {
        const distance = this.calculateDistance(
          booking.customer.latitude,
          booking.customer.longitude,
          { latitude: maid.latitude, longitude: maid.longitude }
        );
        const distanceScore = Math.max(0, 30 - (distance * 5));
        score += distanceScore;
      }
      
      // Skill matching score (0-20 points)
      const serviceCategory = booking.service.category.toLowerCase();
      const skills = maid.maidProfile.skills || [];
      if (skills.some(skill => skill.toLowerCase().includes(serviceCategory.split('_')[0]))) {
        score += 20;
      }
      
      // Attendance score (0-10 points) - check if maid is marked present
      const todayAttendance = maid.maidProfile.attendance[0];
      if (!todayAttendance || todayAttendance.status === 'PRESENT') {
        score += 10;
      }
      
      rankedMaids.push({
        ...maid,
        suitabilityScore: Math.round(score)
      });
    }
    
    // Sort by score (highest first)
    return rankedMaids.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
  }

  /**
   * Calculate distance between two coordinates
   * @param {number} lat1 - Latitude 1
   * @param {number} lon1 - Longitude 1
   * @param {Object} point2 - Point 2 with latitude and longitude
   * @returns {number} Distance in kilometers
   */
  calculateDistance(lat1, lon1, point2) {
    const R = 6371; // Earth's radius in km
    const dLat = (point2.latitude - lat1) * Math.PI / 180;
    const dLon = (point2.longitude - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Update maid's daily booking count
   * @param {string} maidId - Maid ID
   * @param {Date} date - Booking date
   */
  async updateMaidBookingCount(maidId, date) {
    try {
      // This is handled automatically by the database relationships
      // But we could add additional tracking here if needed
      console.log(`📊 Updated booking count for maid ${maidId} on ${date.toDateString()}`);
    } catch (error) {
      console.error('Error updating maid booking count:', error);
    }
  }

  /**
   * Notify admin about unassigned booking
   * @param {Object} booking - Unassigned booking
   */
  async notifyAdminAboutUnassignedBooking(booking) {
    try {
      const notification = {
        type: 'BOOKING_UNASSIGNED',
        title: 'Unassigned Booking Alert',
        message: `Booking ${booking.id} for ${booking.service.name} could not be assigned to any maid`,
        data: {
          bookingId: booking.id,
          customerId: booking.customerId,
          customerName: booking.customer.name,
          serviceName: booking.service.name,
          scheduledAt: booking.scheduledAt,
          priority: booking.priority
        },
        timestamp: new Date().toISOString()
      };

      await notificationService.sendToAdmins(notification);
    } catch (error) {
      console.error('Error notifying admin about unassigned booking:', error);
    }
  }

  /**
   * Reassign maid for a booking (in case of cancellation/issues)
   * @param {string} bookingId - Booking ID
   * @param {string} reason - Reason for reassignment
   * @returns {Promise<Object|null>} New assigned maid
   */
  async reassignMaidToBooking(bookingId, reason = 'Manual reassignment') {
    try {
      const booking = await getPrismaClient().booking.findUnique({
        where: { id: bookingId },
        include: {
          customer: true,
          service: true,
          maid: true
        }
      });

      if (!booking) {
        throw new Error('Booking not found');
      }

      // Clear current maid assignment
      await getPrismaClient().booking.update({
        where: { id: bookingId },
        data: {
          maidId: null,
          status: 'CONFIRMED'
        }
      });

      // Find new maid
      const newMaid = await this.assignBestMaidToBooking(booking);

      if (newMaid) {
        // Notify about reassignment
        if (booking.maid) {
          await notificationService.sendToMaid(booking.maid.id, {
            type: 'BOOKING_REASSIGNED',
            title: 'Booking Reassigned',
            message: `Your booking for ${booking.service.name} has been reassigned. Reason: ${reason}`,
            data: { bookingId, reason },
            timestamp: new Date().toISOString()
          });
        }

        console.log(`✅ Reassigned booking ${bookingId} from ${booking.maid?.name || 'unassigned'} to ${newMaid.name}`);
        return newMaid;
      } else {
        console.log(`❌ Failed to reassign booking ${bookingId} - no available maid found`);
        return null;
      }
    } catch (error) {
      console.error('Error reassigning maid to booking:', error);
      throw error;
    }
  }

  /**
   * Get maid scheduling analytics
   * @param {Object} options - Analytics options
   * @returns {Promise<Object>} Scheduling analytics
   */
  async getSchedulingAnalytics(options = {}) {
    try {
      const { startDate = new Date(), days = 7 } = options;
      
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days);

      // Get assignment statistics
      const totalBookings = await getPrismaClient().booking.count({
        where: {
          scheduledAt: { gte: startDate, lte: endDate }
        }
      });

      const assignedBookings = await getPrismaClient().booking.count({
        where: {
          scheduledAt: { gte: startDate, lte: endDate },
          maidId: { not: null }
        }
      });

      const unassignedBookings = totalBookings - assignedBookings;

      // Get maid utilization
      const maidStats = await getPrismaClient().user.findMany({
        where: {
          role: { in: ['MAID', 'FLOATING_MAID'] },
          status: 'ACTIVE'
        },
        include: {
          maidProfile: true,
          maidBookings: {
            where: {
              scheduledAt: { gte: startDate, lte: endDate },
              status: { in: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED'] }
            }
          }
        }
      });

      const maidUtilization = maidStats.map(maid => {
        const maxCapacity = (maid.maidProfile.maxDailyBookings || this.MAX_DAILY_ASSIGNMENTS) * days;
        const actualBookings = maid.maidBookings.length;
        
        return {
          maidId: maid.id,
          maidName: maid.name,
          actualBookings,
          maxCapacity,
          utilizationRate: Math.round((actualBookings / maxCapacity) * 100)
        };
      });

      return {
        period: {
          startDate,
          endDate,
          days
        },
        bookings: {
          total: totalBookings,
          assigned: assignedBookings,
          unassigned: unassignedBookings,
          assignmentRate: totalBookings > 0 ? Math.round((assignedBookings / totalBookings) * 100) : 0
        },
        maids: {
          total: maidStats.length,
          active: maidStats.filter(m => m.maidProfile.status === 'ACTIVE').length,
          utilization: maidUtilization,
          averageUtilization: Math.round(
            maidUtilization.reduce((sum, m) => sum + m.utilizationRate, 0) / maidUtilization.length
          )
        }
      };
    } catch (error) {
      console.error('Error getting scheduling analytics:', error);
      throw error;
    }
  }
}

module.exports = new MaidSchedulingService();
