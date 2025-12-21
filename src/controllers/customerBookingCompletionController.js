const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Customer-initiated completion with QR verification
// Validates that scanned maid ID matches the maid assigned to the booking
// and marks the booking as COMPLETED
const customerCompleteBookingWithQR = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { qrCodeData, completionNotes } = req.body || {};

    if (!qrCodeData) {
      return res.status(400).json({
        success: false,
        message: 'QR code data is required for verification'
      });
    }

    let qrData;
    try {
      qrData = JSON.parse(qrCodeData);
    } catch {
      qrData = { maidId: qrCodeData };
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        customerId: req.user.id,
        status: { in: ['CONFIRMED', 'IN_PROGRESS'] }
      },
      include: {
        service: true,
        maid: { select: { id: true, name: true } }
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found for this customer or not in a completable state'
      });
    }

    if (!booking.maid) {
      return res.status(400).json({
        success: false,
        message: 'No maid assigned to this booking'
      });
    }

    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: booking.maid.id },
      select: { id: true }
    });

    const expectedUserId = booking.maid.id; // user.id of maid
    const expectedMaidProfileId = maidProfile?.id; // maidProfile.id
    const providedMaidId = qrData.maidId || qrData.id || qrCodeData;

    if (providedMaidId !== expectedUserId && providedMaidId !== expectedMaidProfileId) {
      return res.status(400).json({
        success: false,
        message: 'QR code does not match the assigned maid for this booking'
      });
    }

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'COMPLETED',
        actualEndTime: new Date(),
        completedAt: new Date(),
        specialInstructions: completionNotes || booking.specialInstructions
      },
      include: { service: true }
    });

    try {
      await prisma.notification.create({
        data: {
          userId: booking.maid.id,
          type: 'SERVICE_COMPLETED',
          title: 'Service Completed',
          message: `Customer confirmed completion for ${booking.service.name}.`,
          data: { bookingId: booking.id, confirmedBy: 'CUSTOMER', qrVerified: true }
        }
      });
    } catch (e) {
      console.error('Warning: failed to notify maid of completion', e.message);
    }

    return res.json({
      success: true,
      message: 'Booking completed successfully',
      data: {
        bookingId: updated.id,
        status: updated.status,
        completedAt: updated.completedAt
      }
    });
  } catch (error) {
    console.error('❌ Error completing booking by customer with QR:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete booking',
      error: error.message
    });
  }
};

module.exports = {
  customerCompleteBookingWithQR
};
