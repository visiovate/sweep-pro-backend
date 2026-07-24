const { getPrismaClient } = require('../utils/database');

const prisma = getPrismaClient();

/**
 * Generate a unique 10-character alphanumeric verification code
 * Format: 5 letters + 5 numbers (e.g., "ABCDE12345")
 */
function generateVerificationCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // Removed I and O to avoid confusion
  const numbers = '23456789'; // Removed 0 and 1 to avoid confusion

  let code = '';
  for (let i = 0; i < 5; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 5; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  return code;
}

/**
 * Generate a unique verification code (checks database for uniqueness)
 */
async function generateUniqueVerificationCode() {
  let code;
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    code = generateVerificationCode();
    const existing = await prisma.maidProfile.findUnique({
      where: { verificationCode: code }
    });
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique verification code');
  }

  return code;
}

/**
 * Customer-initiated completion with verification code
 *
 * Flow:
 * 1. Customer has a booking with an assigned maid
 * 2. Maid shows their verification code (e.g., "ABC123")
 * 3. Customer enters this code
 * 4. System verifies the code matches the assigned maid
 * 5. If matched, booking is marked as COMPLETED
 */
const customerCompleteBookingWithQR = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { qrCodeData, verificationCode: inputCode, completionNotes } = req.body || {};

    // Accept either qrCodeData (for backward compatibility) or verificationCode
    let codeToVerify = inputCode || qrCodeData;

    if (!codeToVerify) {
      return res.status(400).json({
        success: false,
        message: 'Please enter the maid\'s verification code'
      });
    }

    if (typeof codeToVerify === 'object' && codeToVerify !== null) {
      codeToVerify = codeToVerify.code || codeToVerify.verificationCode || codeToVerify.toString();
    } else if (typeof codeToVerify === 'string') {
      try {
        const parsed = JSON.parse(codeToVerify);
        if (parsed && typeof parsed === 'object' && (parsed.code || parsed.verificationCode)) {
          codeToVerify = parsed.code || parsed.verificationCode;
        }
      } catch (e) {
        // Not JSON, use raw text
      }
    }

    // Normalize the code (uppercase, trim)
    const normalizedCode = codeToVerify.toString().toUpperCase().trim();

    // Find the booking and verify it belongs to this customer
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        customerId: req.user.id,
        status: { in: ['CONFIRMED', 'ASSIGNED', 'IN_PROGRESS'] }
      },
      include: {
        service: true,
        maid: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or not in a completable state'
      });
    }

    if (!booking.maid) {
      return res.status(400).json({
        success: false,
        message: 'No maid has been assigned to this booking yet'
      });
    }

    // Get the assigned maid's profile with verification code
    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: booking.maid.id },
      select: { id: true, verificationCode: true }
    });

    if (!maidProfile) {
      return res.status(400).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    // Auto-generate verification code if maid doesn't have one
    if (!maidProfile.verificationCode) {
      const newCode = await generateUniqueVerificationCode();
      await prisma.maidProfile.update({
        where: { id: maidProfile.id },
        data: { verificationCode: newCode }
      });
      maidProfile.verificationCode = newCode;
      console.log(`✅ Auto-generated verification code ${newCode} for maid ${booking.maid.id} during booking completion`);
    }

    // Verify the code matches
    if (normalizedCode !== maidProfile.verificationCode) {
      console.log(`❌ Verification code mismatch for booking ${bookingId}`);
      console.log(`   Expected: ${maidProfile.verificationCode}, Got: ${normalizedCode}`);

      return res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please check and try again.'
      });
    }

    // Code verified! Update booking to COMPLETED
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'COMPLETED',
        actualStartTime: booking.actualStartTime || new Date(),
        actualEndTime: new Date(),
        completedAt: new Date(),
        specialInstructions: completionNotes
          ? `${booking.specialInstructions || ''}\n\nCompletion notes: ${completionNotes}`.trim()
          : booking.specialInstructions
      },
      include: { service: true }
    });

    console.log(`✅ Booking ${bookingId} completed - code verified: ${normalizedCode}`);

    // Notify the maid
    try {
      await prisma.notification.create({
        data: {
          userId: booking.maid.id,
          type: 'SERVICE_COMPLETED',
          title: 'Service Completed',
          message: `Customer has confirmed completion of ${booking.service.name} service.`,
          data: {
            bookingId: booking.id,
            confirmedBy: 'CUSTOMER',
            codeVerified: true,
            completedAt: new Date().toISOString()
          }
        }
      });
    } catch (notifError) {
      console.error('Warning: failed to send completion notification to maid', notifError.message);
    }

    return res.json({
      success: true,
      message: 'Service completed successfully! Thank you.',
      data: {
        bookingId: updatedBooking.id,
        status: updatedBooking.status,
        completedAt: updatedBooking.completedAt,
        maidName: booking.maid.name,
        serviceName: booking.service.name
      }
    });

  } catch (error) {
    console.error('❌ Error completing booking with code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete booking. Please try again.',
      error: error.message
    });
  }
};

/**
 * Get maid's verification code and info
 * Used by maid to display their code to customers
 */
const getMaidIdentityQR = async (req, res) => {
  try {
    let maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            profileImage: true
          }
        }
      }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found. Please complete your profile setup.'
      });
    }

    // Generate verification code if maid doesn't have one
    if (!maidProfile.verificationCode) {
      const newCode = await generateUniqueVerificationCode();
      maidProfile = await prisma.maidProfile.update({
        where: { id: maidProfile.id },
        data: { verificationCode: newCode },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              profileImage: true
            }
          }
        }
      });
      console.log(`✅ Generated verification code ${newCode} for maid ${req.user.name}`);
    }

    res.json({
      success: true,
      message: 'Verification code retrieved successfully',
      data: {
        verificationCode: maidProfile.verificationCode,
        qrCodeData: JSON.stringify({
          type: 'maid_verification',
          code: maidProfile.verificationCode,
          maidName: req.user.name
        }),
        maidInfo: {
          id: maidProfile.id,
          userId: req.user.id,
          name: req.user.name,
          email: req.user.email,
          phone: req.user.phone,
          profileImage: req.user.profileImage
        }
      }
    });

  } catch (error) {
    console.error('❌ Error getting maid verification code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get verification code',
      error: error.message
    });
  }
};

/**
 * Generate verification codes for all maids who don't have one
 * Admin utility function
 */
const generateCodesForAllMaids = async (req, res) => {
  try {
    const maidsWithoutCode = await prisma.maidProfile.findMany({
      where: { verificationCode: null },
      select: { id: true, userId: true, user: { select: { name: true } } }
    });

    console.log(`Found ${maidsWithoutCode.length} maids without verification codes`);

    const results = [];
    for (const maid of maidsWithoutCode) {
      try {
        const code = await generateUniqueVerificationCode();
        await prisma.maidProfile.update({
          where: { id: maid.id },
          data: { verificationCode: code }
        });
        results.push({ maidId: maid.id, name: maid.user.name, code, success: true });
        console.log(`✅ Generated code ${code} for ${maid.user.name}`);
      } catch (err) {
        results.push({ maidId: maid.id, name: maid.user.name, success: false, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Generated codes for ${results.filter(r => r.success).length} maids`,
      data: results
    });

  } catch (error) {
    console.error('❌ Error generating codes for maids:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate codes',
      error: error.message
    });
  }
};

/**
 * Set or update maid's custom verification code (10 alphanumeric characters)
 * Allows maid to choose their own code
 */
const setMaidCustomCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a verification code'
      });
    }

    const normalizedCode = code.toString().toUpperCase().trim();

    // Validate: must be exactly 10 alphanumeric characters
    if (!/^[A-Z0-9]{10}$/.test(normalizedCode)) {
      return res.status(400).json({
        success: false,
        message: 'Code must be exactly 10 alphanumeric characters (letters and numbers only)'
      });
    }

    // Check uniqueness
    const existing = await prisma.maidProfile.findUnique({
      where: { verificationCode: normalizedCode }
    });

    if (existing && existing.userId !== req.user.id) {
      return res.status(409).json({
        success: false,
        message: 'This code is already taken. Please choose a different one.'
      });
    }

    const maidProfile = await prisma.maidProfile.findUnique({
      where: { userId: req.user.id }
    });

    if (!maidProfile) {
      return res.status(404).json({
        success: false,
        message: 'Maid profile not found'
      });
    }

    const updated = await prisma.maidProfile.update({
      where: { id: maidProfile.id },
      data: { verificationCode: normalizedCode }
    });

    console.log(`✅ Maid ${req.user.name} set custom verification code: ${normalizedCode}`);

    res.json({
      success: true,
      message: 'Verification code updated successfully',
      data: {
        verificationCode: updated.verificationCode
      }
    });

  } catch (error) {
    console.error('❌ Error setting custom verification code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update verification code',
      error: error.message
    });
  }
};

module.exports = {
  customerCompleteBookingWithQR,
  getMaidIdentityQR,
  generateCodesForAllMaids,
  generateUniqueVerificationCode,
  setMaidCustomCode
};
