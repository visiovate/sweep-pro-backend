const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeAdmin, authorizeMaid } = require('../middleware/auth');
const {
  // Maid assignment routes
  getPendingAssignments,
  getMyAssignments,
  acceptAssignment,
  rejectAssignment,
  
  // Admin assignment routes
  getAllAssignments,
  createAssignment,
  getAssignmentStats,
  getAssignmentById,
  cancelAssignment,
  
  // Admin booking management routes
  getPendingAssignmentBookings,
  getAssignedBookings,
  getReassignmentBookings,
  getAvailableMaids,
  sendAssignmentRequest
} = require('../controllers/assignmentController');

// Maid Assignment Routes
router.get('/pending', authenticateToken, authorizeMaid, getPendingAssignments);
router.get('/my-assignments', authenticateToken, authorizeMaid, getMyAssignments);
router.post('/:assignmentId/accept', authenticateToken, authorizeMaid, acceptAssignment);
router.post('/:assignmentId/reject', authenticateToken, authorizeMaid, rejectAssignment);

// Admin Assignment Routes
router.get('/admin/assignments', authenticateToken, authorizeAdmin, getAllAssignments);
router.post('/admin/assignments/create', authenticateToken, authorizeAdmin, createAssignment);
router.get('/admin/assignments/stats', authenticateToken, authorizeAdmin, getAssignmentStats);
router.get('/admin/assignments/:assignmentId', authenticateToken, authorizeAdmin, getAssignmentById);
router.delete('/admin/assignments/:assignmentId', authenticateToken, authorizeAdmin, cancelAssignment);

// Admin Booking Management Routes (for the new dashboard sections)
router.get('/admin/pending-assignments', authenticateToken, authorizeAdmin, getPendingAssignmentBookings);
router.get('/admin/assigned-bookings', authenticateToken, authorizeAdmin, getAssignedBookings);
router.get('/admin/reassignment-bookings', authenticateToken, authorizeAdmin, getReassignmentBookings);
router.get('/admin/available-maids/:bookingId', authenticateToken, authorizeAdmin, getAvailableMaids);
router.post('/admin/send-assignment-request', authenticateToken, authorizeAdmin, sendAssignmentRequest);

// Debug endpoint to check all assignment requests for a maid
router.get('/debug/maid-assignments/:maidUserId', authenticateToken, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const { maidUserId } = req.params;
    
    // Find the maid profile
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: maidUserId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found for user ID: ' + maidUserId
      });
    }
    
    // Get all assignment requests for this maid
    const allAssignments = await prisma.assignmentRequest.findMany({
      where: { maidId: maidProfile.id },
      include: {
        booking: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            service: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });
    
    // Get only pending assignments
    const pendingAssignments = allAssignments.filter(a => 
      a.status === 'pending' && a.expiresAt > new Date()
    );
    
    res.json({
      success: true,
      data: {
        maidProfile: {
          id: maidProfile.id,
          userId: maidProfile.userId,
          name: maidProfile.user.name,
          email: maidProfile.user.email
        },
        totalAssignments: allAssignments.length,
        pendingAssignments: pendingAssignments.length,
        allAssignments: allAssignments.map(a => ({
          id: a.id,
          status: a.status,
          requestedAt: a.requestedAt,
          expiresAt: a.expiresAt,
          isExpired: a.expiresAt <= new Date(),
          booking: {
            id: a.booking.id,
            scheduledAt: a.booking.scheduledAt,
            status: a.booking.status,
            isAutomatic: a.booking.isAutomatic,
            customer: a.booking.customer?.name,
            service: a.booking.service?.name
          }
        })),
        pendingOnly: pendingAssignments.map(a => ({
          id: a.id,
          requestedAt: a.requestedAt,
          expiresAt: a.expiresAt,
          booking: {
            id: a.booking.id,
            scheduledAt: a.booking.scheduledAt,
            customer: a.booking.customer?.name,
            service: a.booking.service?.name
          }
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint to check specific assignment request and booking
router.get('/admin/debug/assignment-request/:requestId', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const { requestId } = req.params;
    
    // Get the assignment request with booking details
    const assignmentRequest = await prisma.assignmentRequest.findUnique({
      where: { id: requestId },
      include: {
        booking: {
          include: {
            customer: true,
            service: true,
            assignmentRequests: true
          }
        },
        maid: {
          include: {
            user: true
          }
        }
      }
    });
    
    if (!assignmentRequest) {
      return res.status(404).json({
        success: false,
        message: 'Assignment request not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        assignmentRequest: {
          id: assignmentRequest.id,
          status: assignmentRequest.status,
          rejectionReason: assignmentRequest.rejectionReason,
          respondedAt: assignmentRequest.respondedAt,
          maidName: assignmentRequest.maid?.user?.name
        },
        booking: {
          id: assignmentRequest.booking.id,
          status: assignmentRequest.booking.status,
          assignmentStatus: assignmentRequest.booking.assignmentStatus,
          rejectionReason: assignmentRequest.booking.rejectionReason,
          reassignmentCount: assignmentRequest.booking.reassignmentCount,
          maidId: assignmentRequest.booking.maidId,
          customerName: assignmentRequest.booking.customer?.name,
          serviceName: assignmentRequest.booking.service?.name,
          totalAssignmentRequests: assignmentRequest.booking.assignmentRequests?.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Debug endpoint to test reassignment functionality
router.get('/admin/debug/reassignment-status', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    // Get all bookings with their assignment requests
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          { status: 'CANCELLED' },
          { assignmentStatus: 'REJECTED' },
          { assignmentStatus: 'REASSIGNED' }
        ]
      },
      include: {
        assignmentRequests: {
          include: {
            maid: {
              include: {
                user: true
              }
            }
          }
        },
        customer: true,
        service: true
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 10
    });
    
    res.json({
      success: true,
      data: {
        totalBookings: bookings.length,
        bookings: bookings.map(booking => ({
          id: booking.id,
          status: booking.status,
          assignmentStatus: booking.assignmentStatus,
          rejectionReason: booking.rejectionReason,
          maidId: booking.maidId,
          customer: booking.customer?.name,
          service: booking.service?.name,
          assignmentRequests: booking.assignmentRequests.map(req => ({
            id: req.id,
            status: req.status,
            maidName: req.maid?.user?.name,
            rejectionReason: req.rejectionReason,
            respondedAt: req.respondedAt
          }))
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test endpoint to manually check and fix booking status
router.post('/admin/debug/fix-booking-status/:bookingId', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const { bookingId } = req.params;
    
    // Get current booking status
    const currentBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        assignmentRequests: {
          where: { status: 'rejected' }
        }
      }
    });
    
    if (!currentBooking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }
    
    // If there are rejected assignment requests but booking status is not CANCELLED, fix it
    if (currentBooking.assignmentRequests.length > 0 && currentBooking.status !== 'CANCELLED') {
      const updatedBooking = await prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          assignmentStatus: 'REJECTED'
        }
      });
      
      res.json({
        success: true,
        message: 'Booking status fixed',
        data: {
          before: {
            status: currentBooking.status,
            assignmentStatus: currentBooking.assignmentStatus
          },
          after: {
            status: updatedBooking.status,
            assignmentStatus: updatedBooking.assignmentStatus
          },
          rejectedRequests: currentBooking.assignmentRequests.length
        }
      });
    } else {
      res.json({
        success: true,
        message: 'Booking status is already correct',
        data: {
          status: currentBooking.status,
          assignmentStatus: currentBooking.assignmentStatus,
          rejectedRequests: currentBooking.assignmentRequests.length
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
