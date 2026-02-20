const { getPrismaClient } = require('../utils/database');
const { PrismaClient } = require('@prisma/client');
const notificationService = require('./notificationService');
const feedbackAuditService = require('./feedbackAuditService');

const prisma = getPrismaClient();

/**
 * Rating Recalculation Service
 * Handles all rating calculations and recalculations
 */

class RatingRecalculationService {
  /**
   * Recalculate maid's overall rating from all active feedback
   */
  async recalculateMaidRating(maidId, adminId = null) {
    try {
      // Get all ACTIVE feedback for the maid
      const feedbacks = await getPrismaClient().feedback.findMany({
        where: {
          OR: [
            { ratedMaidId: maidId },
            { ratedMaidId: null, booking: { maidId } }
          ],
          status: 'ACTIVE'
        },
        select: {
          id: true,
          overallRating: true,
          qualityRating: true,
          punctualityRating: true,
          behaviorRating: true,
          weight: true
        }
      });

      if (feedbacks.length === 0) {
        // No active feedback, reset rating
        const maidProfile = await getPrismaClient().maidProfile.findUnique({
          where: { userId: maidId }
        });

        if (maidProfile) {
          await getPrismaClient().maidProfile.update({
            where: { id: maidProfile.id },
            data: {
              rating: 0,
              totalRatings: 0
            }
          });
        }

        return {
          maidId,
          oldRating: maidProfile?.rating || 0,
          newRating: 0,
          totalRatings: 0,
          feedback: []
        };
      }

      // Calculate weighted average
      let totalWeightedRating = 0;
      let totalWeight = 0;
      let qualitySum = 0;
      let punctualitySum = 0;
      let behaviorSum = 0;
      let subRatingCount = 0;

      feedbacks.forEach((feedback) => {
        const weight = feedback.weight || 1.0;
        totalWeightedRating += feedback.overallRating * weight;
        totalWeight += weight;

        if (feedback.qualityRating) qualitySum += feedback.qualityRating;
        if (feedback.punctualityRating) punctualitySum += feedback.punctualityRating;
        if (feedback.behaviorRating) behaviorSum += feedback.behaviorRating;
        if (feedback.qualityRating || feedback.punctualityRating || feedback.behaviorRating) {
          subRatingCount++;
        }
      });

      const newRating = totalWeightedRating / totalWeight;
      const newTotalRatings = feedbacks.length;

      // Calculate sub-rating averages
      const avgQuality = subRatingCount > 0 ? qualitySum / subRatingCount : null;
      const avgPunctuality = subRatingCount > 0 ? punctualitySum / subRatingCount : null;
      const avgBehavior = subRatingCount > 0 ? behaviorSum / subRatingCount : null;

      // Get existing maid profile
      const maidUser = await getPrismaClient().user.findUnique({
        where: { id: maidId },
        include: { maidProfile: true }
      });

      if (!maidUser?.maidProfile) {
        throw new Error('Maid profile not found');
      }

      const oldRating = maidUser.maidProfile.rating;
      const ratingDelta = newRating - oldRating;

      // Update maid profile with new rating
      const updatedProfile = await getPrismaClient().maidProfile.update({
        where: { id: maidUser.maidProfile.id },
        data: {
          rating: parseFloat(newRating.toFixed(2)),
          totalRatings: newTotalRatings
        }
      });

      // Create audit entry if admin-initiated
      if (adminId) {
        await feedbackAuditService.logFeedbackAction(null, adminId, 'RATING_ADJUSTED', {
          reason: 'Manual recalculation',
          previousValue: { rating: oldRating },
          newValue: { rating: newRating },
          deltaRating: ratingDelta
        });
      }

      // Update today's rating history
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingHistory = await getPrismaClient().maidRatingHistory.findUnique({
        where: {
          maidId_date: {
            maidId,
            date: today
          }
        }
      });

      if (existingHistory) {
        await getPrismaClient().maidRatingHistory.update({
          where: { id: existingHistory.id },
          data: {
            rating: parseFloat(newRating.toFixed(2)),
            totalRatings: newTotalRatings,
            averageQuality: avgQuality ? parseFloat(avgQuality.toFixed(2)) : null,
            averagePunctuality: avgPunctuality ? parseFloat(avgPunctuality.toFixed(2)) : null,
            averageBehavior: avgBehavior ? parseFloat(avgBehavior.toFixed(2)) : null
          }
        });
      } else {
        await getPrismaClient().maidRatingHistory.create({
          data: {
            maidId,
            date: today,
            rating: parseFloat(newRating.toFixed(2)),
            totalRatings: newTotalRatings,
            averageQuality: avgQuality ? parseFloat(avgQuality.toFixed(2)) : null,
            averagePunctuality: avgPunctuality ? parseFloat(avgPunctuality.toFixed(2)) : null,
            averageBehavior: avgBehavior ? parseFloat(avgBehavior.toFixed(2)) : null
          }
        });
      }

      // Notify admin/system if significant change
      if (Math.abs(ratingDelta) > 0.5) {
        try {
          const admins = await getPrismaClient().user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true }
          });

          for (const admin of admins) {
            await notificationService.createNotification({
              userId: admin.id,
              type: 'RATING_CHANGE_ALERT',
              title: 'Maid Rating Changed',
              message: `${maidUser.name}'s rating changed from ${oldRating.toFixed(1)} to ${newRating.toFixed(1)}`,
              data: {
                maidId,
                oldRating,
                newRating,
                delta: ratingDelta
              }
            });
          }
        } catch (notifError) {
          console.error('Error sending rating change notification:', notifError);
        }
      }

      console.log(`[RatingRecalculation] Maid ${maidId}: ${oldRating.toFixed(2)} → ${newRating.toFixed(2)}`);

      return {
        maidId,
        oldRating,
        newRating: parseFloat(newRating.toFixed(2)),
        totalRatings: newTotalRatings,
        ratingDelta: parseFloat(ratingDelta.toFixed(2)),
        feedbackCount: feedbacks.length,
        averageQuality: avgQuality ? parseFloat(avgQuality.toFixed(2)) : null,
        averagePunctuality: avgPunctuality ? parseFloat(avgPunctuality.toFixed(2)) : null,
        averageBehavior: avgBehavior ? parseFloat(avgBehavior.toFixed(2)) : null
      };
    } catch (error) {
      console.error('[RatingRecalculationService] Error recalculating rating:', error);
      throw error;
    }
  }

  /**
   * Handle feedback status change and update rating accordingly
   */
  async handleFeedbackStatusChange(feedbackId, newStatus, oldStatus, adminId, reason = '') {
    try {
      const feedback = await getPrismaClient().feedback.findUnique({
        where: { id: feedbackId },
        include: {
          booking: {
            include: {
              maid: true
            }
          }
        }
      });

      if (!feedback) {
        throw new Error('Feedback not found');
      }

      const maidId = feedback.ratedMaidId || feedback.booking?.maidId;
      if (!maidId) {
        throw new Error('Maid not found for this feedback');
      }

      // Update feedback status
      const updatedFeedback = await getPrismaClient().feedback.update({
        where: { id: feedbackId },
        data: {
          status: newStatus,
          disputeReason: newStatus === 'DISPUTED' ? reason : null
        }
      });

      // Log the action
      await feedbackAuditService.logFeedbackAction(feedbackId, adminId, 'STATUS_CHANGED', {
        reason,
        previousValue: { status: oldStatus },
        newValue: { status: newStatus }
      });

      // Recalculate maid rating
      const result = await this.recalculateMaidRating(maidId);

      // Notify maid if dispute
      if (newStatus === 'DISPUTED') {
        try {
          await notificationService.createNotification({
            userId: maidId,
            type: 'FEEDBACK_DISPUTED',
            title: 'Feedback Disputed',
            message: `Your feedback has been marked as disputed. Reason: ${reason}`,
            data: {
              feedbackId,
              reason
            }
          });
        } catch (notifError) {
          console.error('Error notifying maid of dispute:', notifError);
        }
      }

      // Notify maid if resolved
      if (newStatus === 'RESOLVED' && oldStatus === 'DISPUTED') {
        try {
          await notificationService.createNotification({
            userId: maidId,
            type: 'DISPUTE_RESOLVED',
            title: 'Dispute Resolved',
            message: 'Your disputed feedback has been reviewed and resolved.',
            data: {
              feedbackId,
              resolution: reason
            }
          });
        } catch (notifError) {
          console.error('Error notifying maid of resolution:', notifError);
        }
      }

      return {
        feedback: updatedFeedback,
        ratingRecalculation: result
      };
    } catch (error) {
      console.error('[RatingRecalculationService] Error handling status change:', error);
      throw error;
    }
  }

  /**
   * Handle weight adjustment
   */
  async adjustFeedbackWeight(feedbackId, newWeight, adminId, reason = '') {
    try {
      if (newWeight < 0 || newWeight > 2) {
        throw new Error('Weight must be between 0 and 2');
      }

      const feedback = await getPrismaClient().feedback.findUnique({
        where: { id: feedbackId },
        include: {
          booking: {
            include: {
              maid: true
            }
          }
        }
      });

      if (!feedback) {
        throw new Error('Feedback not found');
      }

      const oldWeight = feedback.weight;
      const maidId = feedback.ratedMaidId || feedback.booking?.maidId;

      if (!maidId) {
        throw new Error('Maid not found for this feedback');
      }

      // Update weight
      const updatedFeedback = await getPrismaClient().feedback.update({
        where: { id: feedbackId },
        data: {
          weight: newWeight,
          isWeightAdjusted: newWeight !== 1.0
        }
      });

      // Log the action
      await feedbackAuditService.logFeedbackAction(feedbackId, adminId, 'WEIGHT_ADJUSTED', {
        reason,
        previousValue: { weight: oldWeight },
        newValue: { weight: newWeight }
      });

      // Recalculate maid rating
      const result = await this.recalculateMaidRating(maidId);

      return {
        feedback: updatedFeedback,
        ratingRecalculation: result
      };
    } catch (error) {
      console.error('[RatingRecalculationService] Error adjusting weight:', error);
      throw error;
    }
  }

  /**
   * Batch recalculate ratings for all maids
   */
  async recalculateAllMaidRatings(options = {}) {
    try {
      const { flaggedOnly = false } = options;

      let maidIds;
      if (flaggedOnly) {
        // Get maids with flagged feedback
        const flaggedFeedbacks = await getPrismaClient().feedback.findMany({
          where: { verificationFlag: true },
          distinct: ['id'],
          select: {
            ratedMaidId: true,
            booking: {
              select: { maidId: true }
            }
          }
        });

        maidIds = [...new Set(flaggedFeedbacks.map(f => f.ratedMaidId || f.booking?.maidId).filter(Boolean))];
      } else {
        // Get all maids with bookings
        const allMaids = await getPrismaClient().maidProfile.findMany({
          select: { userId: true }
        });

        maidIds = allMaids.map(m => m.userId);
      }

      console.log(`[RatingRecalculation] Starting batch recalculation for ${maidIds.length} maids`);

      const results = [];
      for (const maidId of maidIds) {
        try {
          const result = await this.recalculateMaidRating(maidId);
          results.push(result);
        } catch (error) {
          console.error(`Error recalculating rating for maid ${maidId}:`, error);
          results.push({
            maidId,
            error: error.message
          });
        }
      }

      return {
        totalProcessed: results.length,
        results
      };
    } catch (error) {
      console.error('[RatingRecalculationService] Error in batch recalculation:', error);
      throw error;
    }
  }

  /**
   * Get current rating impact if feedback were to be changed
   */
  async calculateRatingImpact(feedbackId, changeType, newValue = null) {
    try {
      const feedback = await getPrismaClient().feedback.findUnique({
        where: { id: feedbackId },
        include: {
          booking: {
            include: {
              maid: {
                include: {
                  maidProfile: true
                }
              }
            }
          }
        }
      });

      if (!feedback) {
        throw new Error('Feedback not found');
      }

      const currentRating = feedback.booking?.maid?.maidProfile?.rating || 0;

      // Simulate the change
      let simulatedFeedbacks = await getPrismaClient().feedback.findMany({
        where: {
          OR: [
            { ratedMaidId: feedback.ratedMaidId || feedback.booking.maidId },
            { ratedMaidId: null, booking: { maidId: feedback.ratedMaidId || feedback.booking.maidId } }
          ],
          status: 'ACTIVE'
        },
        select: {
          id: true,
          overallRating: true,
          weight: true
        }
      });

      // Apply the change to simulation
      simulatedFeedbacks = simulatedFeedbacks.map(f => {
        if (f.id === feedbackId) {
          if (changeType === 'REMOVE') {
            return null;
          } else if (changeType === 'ADJUST_WEIGHT') {
            return { ...f, weight: newValue };
          } else if (changeType === 'CHANGE_RATING') {
            return { ...f, overallRating: newValue };
          }
        }
        return f;
      }).filter(Boolean);

      // Calculate simulated rating
      let totalWeightedRating = 0;
      let totalWeight = 0;

      simulatedFeedbacks.forEach(f => {
        const weight = f.weight || 1.0;
        totalWeightedRating += f.overallRating * weight;
        totalWeight += weight;
      });

      const simulatedRating = totalWeight > 0 ? totalWeightedRating / totalWeight : 0;
      const impact = simulatedRating - currentRating;

      return {
        currentRating: parseFloat(currentRating.toFixed(2)),
        simulatedRating: parseFloat(simulatedRating.toFixed(2)),
        impact: parseFloat(impact.toFixed(2)),
        changeType,
        newValue
      };
    } catch (error) {
      console.error('[RatingRecalculationService] Error calculating impact:', error);
      throw error;
    }
  }
}

module.exports = new RatingRecalculationService();
