const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notificationService');

const prisma = new PrismaClient();

/**
 * Submit feedback for a completed booking
 */
const submitFeedback = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { bookingId, maidId, overallRating, qualityRating, punctualityRating, behaviorRating, comment, improvements, wouldRecommend } = req.body;

    // Validate required fields
    if (!bookingId || !overallRating) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID and overall rating are required'
      });
    }

    // Validate rating range (1-5)
    if (overallRating < 1 || overallRating > 5) {
      return res.status(400).json({
        success: false,
        error: 'Overall rating must be between 1 and 5'
      });
    }

    // Check if booking exists and belongs to customer
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        maid: {
          include: {
            maidProfile: true
          }
        },
        customer: true,
        service: true,
        feedback: true
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    if (booking.customerId !== customerId) {
      return res.status(403).json({
        success: false,
        error: 'You can only submit feedback for your own bookings'
      });
    }

    // Check if booking is completed
    if (booking.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: 'Feedback can only be submitted for completed bookings'
      });
    }

    // Check if feedback already exists
    if (booking.feedback) {
      return res.status(400).json({
        success: false,
        error: 'Feedback already submitted for this booking'
      });
    }

    // Create feedback
    const feedback = await prisma.feedback.create({
      data: {
        bookingId,
        customerId,
        overallRating,
        qualityRating: qualityRating || null,
        punctualityRating: punctualityRating || null,
        behaviorRating: behaviorRating || null,
        comment: comment || null,
        improvements: improvements || null,
        wouldRecommend: wouldRecommend !== undefined ? wouldRecommend : null
      },
      include: {
        booking: {
          include: {
            maid: {
              include: {
                maidProfile: true
              }
            },
            service: true
          }
        },
        customer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Determine which maid to rate (use provided maidId or booking's maidId)
    const targetMaidId = maidId || booking.maidId;

    if (targetMaidId && !booking.maidId) {
      await prisma.booking.update({
        where: { id: bookingId },
        data: { maidId: targetMaidId }
      });
    }
    
    // Update maid profile rating if maid is assigned
    if (targetMaidId) {
      // Get maid profile
      const maidUser = await prisma.user.findUnique({
        where: { id: targetMaidId },
        include: {
          maidProfile: true
        }
      });

      if (maidUser?.maidProfile) {
        const maidProfile = maidUser.maidProfile;
      
      // Calculate new average rating
      const totalRatings = maidProfile.totalRatings + 1;
      const currentRating = maidProfile.rating || 0;
      const newRating = ((currentRating * maidProfile.totalRatings) + overallRating) / totalRatings;

      // Update maid profile
      await prisma.maidProfile.update({
        where: { id: maidProfile.id },
        data: {
          rating: newRating,
          totalRatings: totalRatings
        }
      });

      // Update performance metrics for current month
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const existingMetric = await prisma.performanceMetric.findUnique({
        where: {
          maidId_month_year: {
            maidId: maidProfile.id,
            month,
            year
          }
        }
      });

      if (existingMetric) {
        // Recalculate average rating for the month
        const monthRatings = await prisma.feedback.findMany({
          where: {
            booking: {
              maidId: targetMaidId,
              completedAt: {
                gte: new Date(year, month - 1, 1),
                lt: new Date(year, month, 1)
              }
            }
          },
          select: {
            overallRating: true
          }
        });

        const monthAverageRating = monthRatings.length > 0
          ? monthRatings.reduce((sum, f) => sum + f.overallRating, 0) / monthRatings.length
          : 0;

        await prisma.performanceMetric.update({
          where: {
            maidId_month_year: {
              maidId: maidProfile.id,
              month,
              year
            }
          },
          data: {
            averageRating: monthAverageRating
          }
        });
      }
      }
    }

    // Send notification to maid if feedback is positive
    if (targetMaidId && overallRating >= 4) {
      try {
        await notificationService.notifyFeedbackReceived({
          userId: targetMaidId,
          type: 'POSITIVE_FEEDBACK',
          title: 'Great Feedback Received!',
          message: `You received a ${overallRating}-star rating from ${booking.customer.name}`,
          data: {
            feedbackId: feedback.id,
            bookingId: booking.id,
            rating: overallRating
          }
        });
      } catch (notifError) {
        console.error('Error sending feedback notification:', notifError);
      }
    }

    // Send notification to admin about new feedback
    try {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true }
      });

      for (const admin of admins) {
        await notificationService.createNotification({
          userId: admin.id,
          type: 'FEEDBACK_RECEIVED',
          title: 'New Feedback Received',
          message: `Customer ${booking.customer.name} submitted feedback for booking #${booking.id}`,
          data: {
            feedbackId: feedback.id,
            bookingId: booking.id,
            rating: overallRating
          }
        });
      }
    } catch (notifError) {
      console.error('Error sending admin notification:', notifError);
    }

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback',
      details: error.message
    });
  }
};

/**
 * Get reviews for the currently authenticated maid
 */
const getMaidReviews = async (req, res) => {
  try {
    const maidUserId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const feedbacks = await prisma.feedback.findMany({
      where: {
        booking: {
          maidId: maidUserId
        },
        status: 'ACTIVE'
      },
      include: {
        customer: {
          select: {
            name: true,
            email: true,
            phone: true,
            profileImage: true
          }
        },
        booking: {
          select: {
            completedAt: true,
            scheduledAt: true,
            service: {
              select: {
                name: true,
                description: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: parseInt(offset),
      take: parseInt(limit)
    });

    const reviews = feedbacks.map((fb) => ({
      id: fb.id,
      rating: fb.overallRating,
      comment: fb.comment || '',
      serviceDate: (fb.booking.completedAt || fb.booking.scheduledAt || fb.createdAt).toISOString(),
      reviewer: {
        name: fb.customer?.name || 'Customer',
        email: fb.customer?.email || undefined,
        phone: fb.customer?.phone || undefined,
        profileImage: fb.customer?.profileImage || undefined
      },
      serviceDetails: fb.booking?.service?.name || fb.booking?.service?.description || ''
    }));

    res.json({
      success: true,
      data: reviews
    });
  } catch (error) {
    console.error('Error fetching maid reviews:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reviews',
      details: error.message
    });
  }
};

/**
 * Get feedback for a specific booking
 */
const getFeedbackByBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.id;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Check if user has access (customer or admin)
    if (booking.customerId !== userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const feedback = await prisma.feedback.findUnique({
      where: { bookingId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImage: true
          }
        },
        booking: {
          include: {
            maid: {
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
      }
    });

    if (!feedback) {
      return res.status(404).json({
        success: false,
        error: 'Feedback not found'
      });
    }

    res.json({
      success: true,
      data: feedback
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feedback',
      details: error.message
    });
  }
};

/**
 * Get all feedback for a customer
 */
const getCustomerFeedback = async (req, res) => {
  try {
    const customerId = req.user.id;

    const feedbacks = await prisma.feedback.findMany({
      where: { customerId },
      include: {
        booking: {
          include: {
            maid: {
              select: {
                id: true,
                name: true,
                email: true,
                profileImage: true,
                maidProfile: {
                  select: {
                    rating: true,
                    totalRatings: true
                  }
                }
              }
            },
            service: {
              select: {
                id: true,
                name: true,
                description: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: feedbacks
    });
  } catch (error) {
    console.error('Error fetching customer feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feedback',
      details: error.message
    });
  }
};

/**
 * Get all feedback (Admin only)
 */
const getAllFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 20, rating, maidId, customerId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (rating) {
      where.overallRating = parseInt(rating);
    }
    if (maidId) {
      where.booking = {
        maidId: maidId
      };
    }
    if (customerId) {
      where.customerId = customerId;
    }

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              profileImage: true
            }
          },
          booking: {
            include: {
              maid: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  profileImage: true,
                  maidProfile: {
                    select: {
                      rating: true,
                      totalRatings: true
                    }
                  }
                }
              },
              service: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: parseInt(limit)
      }),
      prisma.feedback.count({ where })
    ]);

    res.json({
      success: true,
      data: feedbacks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching all feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feedback',
      details: error.message
    });
  }
};

/**
 * Get feedback statistics (Admin only)
 */
const getFeedbackStats = async (req, res) => {
  try {
    const { maidId } = req.query;

    const where = {};
    if (maidId) {
      where.booking = {
        maidId: maidId
      };
    }

    const [
      totalFeedback,
      averageRating,
      ratingDistribution,
      feedbacksWithComments
    ] = await Promise.all([
      prisma.feedback.count({ where }),
      prisma.feedback.aggregate({
        where,
        _avg: {
          overallRating: true
        }
      }),
      prisma.feedback.groupBy({
        by: ['overallRating'],
        where,
        _count: {
          id: true
        }
      }),
      prisma.feedback.count({
        where: {
          ...where,
          comment: {
            not: null
          }
        }
      })
    ]);

    const stats = {
      totalFeedback,
      averageRating: averageRating._avg.overallRating || 0,
      ratingDistribution: ratingDistribution.reduce((acc, item) => {
        acc[item.overallRating] = item._count.id;
        return acc;
      }, {}),
      feedbacksWithComments,
      feedbacksWithoutComments: totalFeedback - feedbacksWithComments
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching feedback stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feedback statistics',
      details: error.message
    });
  }
};

/**
 * Update admin response to feedback (Admin only)
 */
const updateAdminResponse = async (req, res) => {
  try {
    const { feedbackId } = req.params;
    const { adminResponse } = req.body;

    if (!adminResponse) {
      return res.status(400).json({
        success: false,
        error: 'Admin response is required'
      });
    }

    const feedback = await prisma.feedback.update({
      where: { id: feedbackId },
      data: {
        adminResponse,
        adminResponseAt: new Date()
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        booking: {
          include: {
            maid: {
              select: {
                id: true,
                name: true
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
      }
    });

    // Notify customer about admin response
    try {
      await notificationService.createNotification({
        userId: feedback.customerId,
        type: 'FEEDBACK_RECEIVED',
        title: 'Admin Response to Your Feedback',
        message: `Admin has responded to your feedback for ${feedback.booking.service.name}`,
        data: {
          feedbackId: feedback.id,
          bookingId: feedback.bookingId
        }
      });
    } catch (notifError) {
      console.error('Error sending notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Admin response updated successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error updating admin response:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update admin response',
      details: error.message
    });
  }
};

/**
 * Get the most recent completed booking eligible for feedback
 */
const getEligibleBookings = async (req, res) => {
  try {
    const customerId = req.user.id;

    // Get the most recent completed booking without feedback
    // Note: We check for completedAt OR if status is COMPLETED (some bookings might be marked completed without completedAt)
    const booking = await prisma.booking.findFirst({
      where: {
        customerId,
        status: 'COMPLETED',
        feedback: null
      },
      include: {
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            profileImage: true,
            maidProfile: {
              select: {
                rating: true,
                totalRatings: true
              }
            }
          }
        },
        service: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      },
      orderBy: {
        completedAt: 'desc'
      }
    });

    // Get assigned maids for this customer
    const assignedMaids = await prisma.customerMaidAssignment.findMany({
      where: {
        customerId,
        isActive: true
      },
      include: {
        maid: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                profileImage: true,
                phone: true
              }
            }
          }
        }
      }
    });

    const maidsList = assignedMaids.map(assignment => ({
      id: assignment.maid.user.id,
      name: assignment.maid.user.name,
      email: assignment.maid.user.email,
      phone: assignment.maid.user.phone,
      profileImage: assignment.maid.user.profileImage,
      rating: assignment.maid.rating,
      totalRatings: assignment.maid.totalRatings
    }));

    res.json({
      success: true,
      data: {
        bookings: booking ? [booking] : [],
        assignedMaids: maidsList
      }
    });
  } catch (error) {
    console.error('Error fetching eligible bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch eligible bookings',
      details: error.message
    });
  }
};

module.exports = {
  submitFeedback,
  getFeedbackByBooking,
  getCustomerFeedback,
  getMaidReviews,
  getAllFeedback,
  getFeedbackStats,
  updateAdminResponse,
  getEligibleBookings
};

