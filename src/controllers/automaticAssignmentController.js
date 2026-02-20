const { getPrismaClient } = require('../utils/database');
const AutomaticAssignmentService = require('../services/automaticAssignmentService');
const { formatTimeSlot, parseTimeSlot } = require('../utils/timeSlotUtils');

/**
 * Trigger automatic assignment request processing
 */
const processAutomaticAssignments = async (req, res) => {
  try {
    console.log('🔄 Manual trigger for automatic assignment processing');
    
    const result = await AutomaticAssignmentService.processAutomaticRequests();
    
    return res.status(200).json({
      success: true,
      message: 'Automatic assignment processing completed',
      data: result
    });

  } catch (error) {
    console.error('❌ Process automatic assignments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get upcoming assignment requests
 */
const getUpcomingRequests = async (req, res) => {
  try {
    const upcomingRequests = await AutomaticAssignmentService.getUpcomingRequests();
    
    // Format the response
    const formattedRequests = upcomingRequests.map(request => ({
      id: request.id,
      bookingId: request.booking.id,
      customerName: request.booking.customer.name,
      maidName: request.maid.user.name,
      timeSlot: formatTimeSlot(request.booking.customer.timeSlot),
      rawTimeSlot: request.booking.customer.timeSlot,
      serviceName: request.booking.service.name,
      scheduledAt: request.booking.scheduledAt,
      expiresAt: request.expiresAt,
      status: request.status,
      createdAt: request.createdAt
    }));

    return res.status(200).json({
      success: true,
      data: {
        requests: formattedRequests,
        count: formattedRequests.length
      }
    });

  } catch (error) {
    console.error('❌ Get upcoming requests error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get automatic assignment statistics
 */
const getStatistics = async (req, res) => {
  try {
    const stats = await AutomaticAssignmentService.getStatistics();
    
    return res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('❌ Get statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Test time slot parsing
 */
const testTimeSlotParsing = async (req, res) => {
  try {
    const { timeSlots } = req.body;
    
    if (!timeSlots || !Array.isArray(timeSlots)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of time slots to test'
      });
    }

    const results = timeSlots.map(slot => ({
      original: slot,
      parsed: parseTimeSlot(slot),
      formatted: formatTimeSlot(slot)
    }));

    return res.status(200).json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('❌ Test time slot parsing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get all customers with their time slots and next service times
 */
const getCustomerTimeSlots = async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = getPrismaClient();
    const { getNextServiceDateTime, calculateRequestTime } = require('../utils/timeSlotUtils');

    const activeAssignments = await prisma.customerMaidAssignment.findMany({
      where: {
        isActive: true
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            timeSlot: true
          }
        },
        maid: {
          include: {
            user: {
              select: {
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    const customerTimeSlots = activeAssignments.map(assignment => {
      const timeSlot = assignment.customer.timeSlot;
      const nextService = getNextServiceDateTime(timeSlot);
      const requestTime = calculateRequestTime(nextService, timeSlot);

      return {
        customerId: assignment.customer.id,
        customerName: assignment.customer.name,
        maidName: assignment.maid.user.name,
        timeSlot: timeSlot,
        formattedTimeSlot: formatTimeSlot(timeSlot),
        parsedHour: parseTimeSlot(timeSlot),
        nextServiceTime: nextService.toISOString(),
        requestCreationTime: requestTime.toISOString(),
        hoursUntilRequest: Math.round((requestTime.getTime() - new Date().getTime()) / (1000 * 60 * 60))
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        customers: customerTimeSlots,
        count: customerTimeSlots.length
      }
    });

  } catch (error) {
    console.error('❌ Get customer time slots error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  processAutomaticAssignments,
  getUpcomingRequests,
  getStatistics,
  testTimeSlotParsing,
  getCustomerTimeSlots
};
