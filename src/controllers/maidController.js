const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all maids
const getAllMaids = async (req, res) => {
  try {
    const maids = await prisma.user.findMany({
      where: { role: 'MAID' },
      include: { maidProfile: true }
    });
    res.json(maids);
  } catch (error) {
    console.error('Error fetching maids:', error);
    res.status(500).json({ error: 'Failed to fetch maids' });
  }
};

// Update maid weekly off day (admin only)
const updateMaidWeeklyOffDay = async (req, res) => {
  try {
    const { id } = req.params;
    const { weeklyOffDay } = req.body;

    const allowed = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const normalizedWeeklyOffDay = weeklyOffDay === undefined || weeklyOffDay === 'NONE' ? null : weeklyOffDay;
    if (!(normalizedWeeklyOffDay === null || allowed.includes(normalizedWeeklyOffDay))) {
      return res.status(400).json({ error: 'Invalid weeklyOffDay' });
    }

    const maidProfile = await prisma.maidProfile.findFirst({
      where: {
        OR: [{ userId: id }, { id: id }]
      },
      select: { id: true }
    });

    let profileId = maidProfile?.id;

    if (!profileId) {
      const maidUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true }
      });

      if (!maidUser) {
        return res.status(404).json({ error: 'Maid user not found' });
      }

      if (maidUser.role !== 'MAID') {
        return res.status(400).json({ error: 'User is not a maid' });
      }

      const createdProfile = await prisma.maidProfile.create({
        data: {
          userId: maidUser.id,
          skills: [],
          languages: [],
          availability: {
            isAvailable: true
          },
          weeklyOffDay: normalizedWeeklyOffDay
        },
        select: { id: true }
      });

      profileId = createdProfile.id;
    }

    const updated = await prisma.maidProfile.update({
      where: { id: profileId },
      data: { weeklyOffDay: normalizedWeeklyOffDay }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating maid weekly off day:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to update maid weekly off day',
      details: error.message 
    });
  }
};

// Get a maid by ID
const getMaidById = async (req, res) => {
  try {
    const { id } = req.params;
    const maid = await prisma.user.findUnique({
      where: { id },
      include: { maidProfile: true }
    });
    if (!maid || maid.role !== 'MAID') {
      return res.status(404).json({ error: 'Maid not found' });
    }
    res.json(maid);
  } catch (error) {
    console.error('Error fetching maid:', error);
    res.status(500).json({ error: 'Failed to fetch maid' });
  }
};

// Update maid profile (skills, languages, availability, zone)
const updateMaidProfile = async (req, res) => {
  try {
    const maidId = req.user.id;
    const { skills, languages, availability, zone } = req.body;
    const maid = await prisma.maidProfile.update({
      where: { userId: maidId },
      data: { skills, languages, availability, zone }
    });
    res.json(maid);
  } catch (error) {
    console.error('Error updating maid profile:', error);
    res.status(500).json({ error: 'Failed to update maid profile' });
  }
};

const setMaidAvailability = async (req, res) => {
  try {
    const maidUserId = req.user.id;
    const { isAvailable, note } = req.body;
    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({ error: 'isAvailable must be a boolean' });
    }
    const profile = await prisma.maidProfile.findUnique({ where: { userId: maidUserId } });
    if (!profile) {
      return res.status(404).json({ error: 'Maid profile not found' });
    }
    const currentAvailability = (profile.availability && typeof profile.availability === 'object') ? profile.availability : {};
    const updatedAvailability = {
      ...currentAvailability,
      isAvailable,
      note: note !== undefined ? note : currentAvailability.note,
      updatedAt: new Date().toISOString()
    };
    const updated = await prisma.maidProfile.update({
      where: { userId: maidUserId },
      data: { availability: updatedAvailability }
    });
    res.json({ success: true, data: { isAvailable: !(updated.availability && updated.availability.isAvailable === false) } });
  } catch (error) {
    console.error('Error updating maid availability:', error);
    res.status(500).json({ error: 'Failed to update availability' });
  }
};

// Update maid status (admin only)
const updateMaidStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const maid = await prisma.maidProfile.update({
      where: { userId: id },
      data: { status }
    });
    res.json(maid);
  } catch (error) {
    console.error('Error updating maid status:', error);
    res.status(500).json({ error: 'Failed to update maid status' });
  }
};

// Delete maid (admin only)
const deleteMaid = async (req, res) => {
  try {
    const { id } = req.params;
    // Delete maid profile first due to FK constraint
    await prisma.maidProfile.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Maid deleted successfully' });
  } catch (error) {
    console.error('Error deleting maid:', error);
    res.status(500).json({ error: 'Failed to delete maid' });
  }
};

// Verify OTP and start service
const verifyStartOTP = async (req, res) => {
  try {
    const { bookingId, otp } = req.body;
    const maidId = req.user.id;

    // Check if maid is assigned to this booking
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        maidId,
        status: 'ASSIGNED'
      },
      include: {
        serviceOTP: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or not assigned to you' });
    }

    // Verify OTP
    if (!booking.serviceOTP || booking.serviceOTP.startOTP !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Update booking status and OTP verification
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'IN_PROGRESS',
          actualStartTime: new Date()
        }
      }),
      prisma.serviceOTP.update({
        where: { bookingId },
        data: {
          startVerified: true,
          startOTPVerifiedAt: new Date()
        }
      })
    ]);

    res.json({
      success: true,
      message: 'Service started successfully'
    });

  } catch (error) {
    console.error('Error verifying start OTP:', error);
    res.status(500).json({ message: 'Failed to verify OTP' });
  }
};

// Complete service and verify end OTP
const completeService = async (req, res) => {
  try {
    const { bookingId, otp, notes } = req.body;
    const maidId = req.user.id;

    // Check if maid is assigned to this booking
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        maidId,
        status: 'IN_PROGRESS'
      },
      include: {
        serviceOTP: true
      }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or not in progress' });
    }

    // Verify end OTP
    if (!booking.serviceOTP || booking.serviceOTP.endOTP !== otp) {
      return res.status(400).json({ message: 'Invalid completion OTP' });
    }

    // Update booking status and completion
    await prisma.$transaction([
      prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'COMPLETED',
          actualEndTime: new Date(),
          completedAt: new Date(),
          specialInstructions: notes || booking.specialInstructions
        }
      }),
      prisma.serviceOTP.update({
        where: { bookingId },
        data: {
          endVerified: true,
          endOTPVerifiedAt: new Date()
        }
      })
    ]);

    // Update maid performance metrics
    await updateMaidPerformance(maidId);

    res.json({
      success: true,
      message: 'Service completed successfully'
    });

  } catch (error) {
    console.error('Error completing service:', error);
    res.status(500).json({ message: 'Failed to complete service' });
  }
};


const getMaidAssignments = async (req, res) => {
  try {
    const maidId = req.user.id;
    const { status } = req.query;

    const whereCondition = {
      maidId,
      ...(status && { status })
    };

    const bookings = await prisma.booking.findMany({
      where: whereCondition,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true
          }
        },
        service: true,
        serviceOTP: true
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching maid assignments:', error);
    res.status(500).json({ message: 'Failed to fetch assignments' });
  }
};

// Generate end OTP (when maid is ready to complete service)
const generateEndOTP = async (req, res) => {
  try {
    const { bookingId } = req.body;
    const maidId = req.user.id;

    // Check if maid is assigned and service is in progress
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        maidId,
        status: 'IN_PROGRESS'
      }
    });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or not in progress' });
    }

    // Generate end OTP
    const endOTP = Math.floor(100000 + Math.random() * 900000).toString();

    // Update or create service OTP
    await prisma.serviceOTP.upsert({
      where: { bookingId },
      update: {
        endOTP,
        endOTPGeneratedAt: new Date()
      },
      create: {
        bookingId,
        endOTP,
        endOTPGeneratedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Completion OTP generated and sent to customer',
      otp: endOTP // In production, don't send OTP in response
    });

  } catch (error) {
    console.error('Error generating end OTP:', error);
    res.status(500).json({ message: 'Failed to generate completion OTP' });
  }
};

// Helper function to update maid performance
async function updateMaidPerformance(maidId) {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get completed bookings for current month
    const completedBookings = await prisma.booking.count({
      where: {
        maidId,
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(currentYear, currentMonth - 1, 1),
          lt: new Date(currentYear, currentMonth, 1)
        }
      }
    });

    // Update or create performance metric
    await prisma.performanceMetric.upsert({
      where: {
        maidId_month_year: {
          maidId,
          month: currentMonth,
          year: currentYear
        }
      },
      update: {
        completedBookings
      },
      create: {
        maidId,
        month: currentMonth,
        year: currentYear,
        completedBookings
      }
    });

    // Update maid profile completed bookings count
    await prisma.maidProfile.update({
      where: { userId: maidId },
      data: {
        completedBookings: {
          increment: 1
        }
      }
    });

  } catch (error) {
    console.error('Error updating maid performance:', error);
  }
}

module.exports = {
  getAllMaids,
  getMaidById,
  updateMaidProfile,
  setMaidAvailability,
  updateMaidStatus,
  updateMaidWeeklyOffDay,
  deleteMaid,
  verifyStartOTP,
  completeService,
  getMaidAssignments,
  generateEndOTP
};
