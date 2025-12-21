const { PrismaClient } = require('@prisma/client');
const notificationService = require('../services/notificationService');

const prisma = new PrismaClient();

/**
 * Get complete profile with all related data
 */
const getCompleteProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customerProfile: {
          include: {
            subscription: true,
          }
        },
        maidProfile: {
          include: {
            documents: true,
            zones: {
              include: {
                zone: true
              }
            },
            performanceMetrics: {
              orderBy: {
                createdAt: 'desc'
              },
              take: 10
            }
          }
        },
        adminProfile: true,
        customerBookings: {
          orderBy: {
            scheduledAt: 'desc'
          },
          take: 10,
          include: {
            service: true
          }
        },
        maidBookings: {
          orderBy: {
            scheduledAt: 'desc'
          },
          take: 10,
          include: {
            service: true,
            customer: {
              select: {
                name: true,
                profileImage: true,
                address: true
              }
            }
          }
        },
        feedbacks: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 10
        }
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Update last active timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { lastActive: new Date() }
    });

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    // Calculate additional stats
    const stats = await calculateProfileStats(userId, user.role);

    res.json({ 
      success: true,
      data: {
        ...userWithoutPassword,
        stats
      }
    });
  } catch (error) {
    console.error('Error fetching complete profile:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get public profile (for viewing other users)
 */
const getPublicProfile = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        profileImage: true,
        coverImage: true,
        bio: true,
        address: true,
        city: true,
        state: true,
        isProfilePublic: true,
        socialLinks: true,
        createdAt: true,
        lastActive: true,
        customerProfile: {
          select: {
            interests: true,
            favoriteServices: true,
            totalBookingsCount: true,
            memberSince: true
          }
        },
        maidProfile: {
          select: {
            skills: true,
            languages: true,
            rating: true,
            totalRatings: true,
            completedBookings: true,
            experienceYears: true,
            certifications: true,
            achievements: true,
            specializations: true,
            isVerified: true,
            verificationDate: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    if (!user.isProfilePublic && req.user.id !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'This profile is private' 
      });
    }

    // Increment profile views for maids
    if (user.role === 'MAID' && user.maidProfile) {
      await prisma.maidProfile.update({
        where: { userId },
        data: {
          profileViews: {
            increment: 1
          }
        }
      });
    }

    res.json({ 
      success: true,
      data: user 
    });
  } catch (error) {
    console.error('Error fetching public profile:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching profile' 
    });
  }
};

/**
 * Update user profile (basic info)
 */
const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      phone,
      bio,
      dateOfBirth,
      gender,
      address,
      addressLine,
      city,
      state,
      pincode,
      locality,
      landmark,
      latitude,
      longitude,
      profileImage,
      coverImage,
      socialLinks,
      isProfilePublic,
      languagePreferences
    } = req.body;

    // Build update data dynamically
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = new Date(dateOfBirth);
    if (gender !== undefined) updateData.gender = gender;
    if (address !== undefined) updateData.address = address;
    if (addressLine !== undefined) updateData.addressLine = addressLine;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (pincode !== undefined) updateData.pincode = pincode;
    if (locality !== undefined) updateData.locality = locality;
    if (landmark !== undefined) updateData.landmark = landmark;
    if (latitude !== undefined) updateData.latitude = parseFloat(latitude);
    if (longitude !== undefined) updateData.longitude = parseFloat(longitude);
    if (profileImage !== undefined) updateData.profileImage = profileImage;
    if (coverImage !== undefined) updateData.coverImage = coverImage;
    if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
    if (isProfilePublic !== undefined) updateData.isProfilePublic = isProfilePublic;
    if (languagePreferences !== undefined) updateData.languagePreferences = languagePreferences;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        customerProfile: true,
        maidProfile: true,
        adminProfile: true
      }
    });

    // Remove password from response
    const { password, ...userWithoutPassword } = updatedUser;

    // Send notification
    try {
      await notificationService.notifyUserProfileUpdate(updatedUser);
    } catch (e) {
      console.warn('Notification failed:', e?.message || e);
    }

    res.json({ 
      success: true,
      data: userWithoutPassword,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        success: false,
        error: 'Phone number already exists' 
      });
    }
    res.status(500).json({ 
      success: false,
      error: 'Error updating profile' 
    });
  }
};

/**
 * Update customer profile
 */
const updateCustomerProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      preferences,
      emergencyContact,
      specialInstructions,
      interests,
      favoriteServices,
      preferredMaidIds
    } = req.body;

    // Check if user is a customer
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user.role !== 'CUSTOMER') {
      return res.status(403).json({ 
        success: false,
        error: 'Only customers can update customer profile' 
      });
    }

    const updateData = {};
    if (preferences !== undefined) updateData.preferences = preferences;
    if (emergencyContact !== undefined) updateData.emergencyContact = emergencyContact;
    if (specialInstructions !== undefined) updateData.specialInstructions = specialInstructions;
    if (interests !== undefined) updateData.interests = interests;
    if (favoriteServices !== undefined) updateData.favoriteServices = favoriteServices;
    if (preferredMaidIds !== undefined) updateData.preferredMaidIds = preferredMaidIds;

    const updatedProfile = await prisma.customerProfile.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        ...updateData
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            profileImage: true
          }
        }
      }
    });

    res.json({ 
      success: true,
      data: updatedProfile,
      message: 'Customer profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating customer profile:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error updating customer profile' 
    });
  }
};

/**
 * Update maid profile
 */
const updateMaidProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      skills,
      languages,
      availability,
      hourlyRate,
      experienceYears,
      certifications,
      achievements,
      specializations,
      maxDailyBookings,
      serviceRadius
    } = req.body;

    // Check if user is a maid
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user.role !== 'MAID') {
      return res.status(403).json({ 
        success: false,
        error: 'Only maids can update maid profile' 
      });
    }

    const updateData = {};
    if (skills !== undefined) updateData.skills = skills;
    if (languages !== undefined) updateData.languages = languages;
    if (availability !== undefined) updateData.availability = availability;
    if (hourlyRate !== undefined) updateData.hourlyRate = parseFloat(hourlyRate);
    if (experienceYears !== undefined) updateData.experienceYears = parseInt(experienceYears);
    if (certifications !== undefined) updateData.certifications = certifications;
    if (achievements !== undefined) updateData.achievements = achievements;
    if (specializations !== undefined) updateData.specializations = specializations;
    if (maxDailyBookings !== undefined) updateData.maxDailyBookings = parseInt(maxDailyBookings);
    if (serviceRadius !== undefined) updateData.serviceRadius = parseFloat(serviceRadius);

    const updatedProfile = await prisma.maidProfile.upsert({
      where: { userId },
      update: updateData,
      create: {
        userId,
        skills: skills || [],
        languages: languages || [],
        availability: availability || {},
        ...updateData
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            profileImage: true,
            coverImage: true,
            bio: true
          }
        },
        documents: true,
        zones: {
          include: {
            zone: true
          }
        }
      }
    });

    res.json({ 
      success: true,
      data: updatedProfile,
      message: 'Maid profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating maid profile:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error updating maid profile' 
    });
  }
};

/**
 * Upload profile image
 */
const uploadProfileImage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { imageUrl, imageType } = req.body; // imageType: 'profile' or 'cover'

    if (!imageUrl || !imageType) {
      return res.status(400).json({ 
        success: false,
        error: 'Image URL and type are required' 
      });
    }

    const updateData = {};
    if (imageType === 'profile') {
      updateData.profileImage = imageUrl;
    } else if (imageType === 'cover') {
      updateData.coverImage = imageUrl;
    } else {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid image type. Use "profile" or "cover"' 
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        profileImage: true,
        coverImage: true
      }
    });

    res.json({ 
      success: true,
      data: updatedUser,
      message: `${imageType === 'profile' ? 'Profile' : 'Cover'} image updated successfully`
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error uploading image' 
    });
  }
};

/**
 * Delete profile image
 */
const deleteProfileImage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { imageType } = req.params; // 'profile' or 'cover'

    const updateData = {};
    if (imageType === 'profile') {
      updateData.profileImage = null;
    } else if (imageType === 'cover') {
      updateData.coverImage = null;
    } else {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid image type' 
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    res.json({ 
      success: true,
      message: `${imageType === 'profile' ? 'Profile' : 'Cover'} image deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error deleting image' 
    });
  }
};

/**
 * Get profile statistics
 */
const getProfileStats = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    const stats = await calculateProfileStats(userId, user.role);

    res.json({ 
      success: true,
      data: stats 
    });
  } catch (error) {
    console.error('Error fetching profile stats:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching profile statistics' 
    });
  }
};

/**
 * Get recent activity
 */
const getRecentActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    let activities = [];

    if (user.role === 'CUSTOMER') {
      // Get customer activities
      const bookings = await prisma.booking.findMany({
        where: { customerId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          service: true,
          maid: {
            include: {
              user: {
                select: { name: true }
              }
            }
          }
        }
      });

      activities = bookings.map(booking => ({
        id: booking.id,
        type: 'booking',
        action: `Booked ${booking.service.name}`,
        details: booking.maid ? `with ${booking.maid.user.name}` : 'pending assignment',
        status: booking.status,
        time: booking.createdAt,
        icon: 'calendar'
      }));
    } else if (user.role === 'MAID') {
      // Get maid activities
      const bookings = await prisma.booking.findMany({
        where: { maidId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          service: true,
          customer: {
            select: { name: true, address: true }
          }
        }
      });

      activities = bookings.map(booking => ({
        id: booking.id,
        type: 'booking',
        action: `${booking.status === 'COMPLETED' ? 'Completed' : 'Assigned'} ${booking.service.name}`,
        details: `for ${booking.customer.name}`,
        status: booking.status,
        time: booking.createdAt,
        icon: 'briefcase'
      }));
    }

    res.json({ 
      success: true,
      data: activities 
    });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error fetching recent activity' 
    });
  }
};

/**
 * Helper function to calculate profile statistics
 */
async function calculateProfileStats(userId, role) {
  const stats = {
    profileCompleteness: 0,
    totalActivity: 0
  };

  try {
    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        customerProfile: true,
        maidProfile: true
      }
    });

    // Calculate profile completeness
    const fields = [
      user.name,
      user.email,
      user.phone,
      user.address,
      user.profileImage,
      user.bio
    ];
    const filledFields = fields.filter(f => f).length;
    stats.profileCompleteness = Math.round((filledFields / fields.length) * 100);

    if (role === 'CUSTOMER') {
      // Customer stats
      const bookingsCount = await prisma.booking.count({
        where: { customerId: userId }
      });

      const totalSpent = await prisma.payment.aggregate({
        where: { 
          customerId: userId,
          status: 'COMPLETED'
        },
        _sum: { amount: true }
      });

      stats.totalBookings = bookingsCount;
      stats.totalSpent = totalSpent._sum.amount || 0;
      stats.totalActivity = bookingsCount;

      // Update customer profile with stats
      await prisma.customerProfile.upsert({
        where: { userId },
        update: {
          totalBookingsCount: bookingsCount,
          totalSpent: totalSpent._sum.amount || 0
        },
        create: {
          userId,
          totalBookingsCount: bookingsCount,
          totalSpent: totalSpent._sum.amount || 0
        }
      });

    } else if (role === 'MAID') {
      // Maid stats
      const completedBookings = await prisma.booking.count({
        where: { 
          maidId: userId,
          status: 'COMPLETED'
        }
      });

      const totalEarnings = await prisma.payment.aggregate({
        where: { 
          booking: {
            maidId: userId
          },
          status: 'COMPLETED'
        },
        _sum: { amount: true }
      });

      const avgRating = await prisma.feedback.aggregate({
        where: {
          booking: {
            maidId: userId
          }
        },
        _avg: { rating: true },
        _count: true
      });

      stats.completedBookings = completedBookings;
      stats.totalEarnings = totalEarnings._sum.amount || 0;
      stats.averageRating = avgRating._avg.rating || 0;
      stats.totalRatings = avgRating._count;
      stats.totalActivity = completedBookings;

      // Update maid profile with stats
      if (user.maidProfile) {
        await prisma.maidProfile.update({
          where: { userId },
          data: {
            completedBookings,
            totalEarnings: totalEarnings._sum.amount || 0,
            rating: avgRating._avg.rating || 0,
            totalRatings: avgRating._count
          }
        });
      }
    }

    return stats;
  } catch (error) {
    console.error('Error calculating profile stats:', error);
    return stats;
  }
}

module.exports = {
  getCompleteProfile,
  getPublicProfile,
  updateUserProfile,
  updateCustomerProfile,
  updateMaidProfile,
  uploadProfileImage,
  deleteProfileImage,
  getProfileStats,
  getRecentActivity
};
