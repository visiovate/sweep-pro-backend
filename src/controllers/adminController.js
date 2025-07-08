const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all customers with active subscriptions for admin dashboard
const getActiveCustomers = async (req, res) => {
  try {
    const customers = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { gte: new Date() }
      },
      include: {
        customer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                address: true,
                latitude: true,
                longitude: true
              }
            }
          }
        },
        plan: {
          include: {
            service: true
          }
        }
      }
    });

    res.json(customers);
  } catch (error) {
    console.error('Error fetching active customers:', error);
    res.status(500).json({ message: 'Failed to fetch active customers' });
  }
};

// Get pending bookings that need maid assignment
const getPendingBookings = async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        maidId: null
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
        service: true
      },
      orderBy: {
        scheduledAt: 'asc'
      }
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching pending bookings:', error);
    res.status(500).json({ message: 'Failed to fetch pending bookings' });
  }
};

// Get available maids for assignment
const getAvailableMaids = async (req, res) => {
  try {
    const { date, latitude, longitude } = req.query;

    const maids = await prisma.user.findMany({
      where: {
        role: 'MAID',
        status: 'ACTIVE',
        maidProfile: {
          status: 'ACTIVE'
        }
      },
      include: {
        maidProfile: true
      }
    });

    // Filter maids based on availability and proximity if coordinates provided
    let availableMaids = maids;
    
    if (latitude && longitude) {
      // Simple distance calculation - in production, use proper geospatial queries
      availableMaids = maids.filter(maid => {
        if (!maid.latitude || !maid.longitude) return true;
        
        const distance = calculateDistance(
          parseFloat(latitude), 
          parseFloat(longitude),
          maid.latitude,
          maid.longitude
        );
        
        return distance <= (maid.maidProfile?.serviceRadius || 5); // Default 5km radius
      });
    }

    res.json(availableMaids);
  } catch (error) {
    console.error('Error fetching available maids:', error);
    res.status(500).json({ message: 'Failed to fetch available maids' });
  }
};

// Assign maid to booking
const assignMaidToBooking = async (req, res) => {
  try {
    const { bookingId, maidId } = req.body;

    // Check if maid is available
    const maid = await prisma.user.findFirst({
      where: {
        id: maidId,
        role: 'MAID',
        status: 'ACTIVE'
      },
      include: {
        maidProfile: true
      }
    });

    if (!maid) {
      return res.status(404).json({ message: 'Maid not found or not available' });
    }

    // Update booking with maid assignment
    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        maidId,
        status: 'ASSIGNED'
      },
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
        maid: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        service: true
      }
    });

    // Create notification for both customer and maid
    await prisma.notification.createMany({
      data: [
        {
          userId: booking.customerId,
          type: 'MAID_ASSIGNED',
          title: 'Maid Assigned',
          message: `${maid.name} has been assigned to your service on ${booking.scheduledAt.toDateString()}`
        },
        {
          userId: maidId,
          type: 'SERVICE_ASSIGNED',
          title: 'New Service Assignment',
          message: `You have been assigned to serve ${booking.customer.name} on ${booking.scheduledAt.toDateString()}`
        }
      ]
    });

    res.json({
      success: true,
      data: booking,
      message: 'Maid assigned successfully'
    });

  } catch (error) {
    console.error('Error assigning maid to booking:', error);
    res.status(500).json({ message: 'Failed to assign maid to booking' });
  }
};

// Generate OTP for service verification
const generateServiceOTP = async (req, res) => {
  try {
    const { bookingId } = req.body;

    // Generate 6-digit OTP
    const startOTP = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in ServiceOTP table
    await prisma.serviceOTP.upsert({
      where: { bookingId },
      update: {
        startOTP,
        startOTPGeneratedAt: new Date()
      },
      create: {
        bookingId,
        startOTP,
        startOTPGeneratedAt: new Date()
      }
    });

    // In production, send OTP via SMS/Email to customer
    console.log(`Start OTP generated for booking ${bookingId}: ${startOTP}`);

    res.json({
      success: true,
      message: 'Start OTP generated and sent to customer',
      otp: startOTP // In production, don't send OTP in response
    });

  } catch (error) {
    console.error('Error generating OTP:', error);
    res.status(500).json({ message: 'Failed to generate OTP' });
  }
};

// Helper function to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km
  return distance;
}

module.exports = {
  getActiveCustomers,
  getPendingBookings,
  getAvailableMaids,
  assignMaidToBooking,
  generateServiceOTP
};
