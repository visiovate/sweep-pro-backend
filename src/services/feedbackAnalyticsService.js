const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Feedback Analytics Service
 * Provides comprehensive analytics and reporting on feedback
 */

class FeedbackAnalyticsService {
  /**
   * Get comprehensive maid feedback analytics
   */
  async getMaidFeedbackAnalytics(maidId, options = {}) {
    try {
      const { days = 30, includeHistory = true } = options;

      // Get maid profile
      const maidUser = await prisma.user.findUnique({
        where: { id: maidId },
        include: {
          maidProfile: true
        }
      });

      if (!maidUser?.maidProfile) {
        throw new Error('Maid not found');
      }

      const maidProfile = maidUser.maidProfile;

      // Get all feedback for the maid
      const allFeedback = await prisma.feedback.findMany({
        where: {
          booking: {
            maidId
          }
        },
        include: {
          booking: {
            select: {
              id: true,
              completedAt: true,
              customer: {
                select: {
                  name: true,
                  profileImage: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Get active feedback only
      const activeFeedback = allFeedback.filter(f => f.status === 'ACTIVE');
      const disputedFeedback = allFeedback.filter(f => f.status === 'DISPUTED');
      const resolvedFeedback = allFeedback.filter(f => f.status === 'RESOLVED');
      const removedFeedback = allFeedback.filter(f => f.status === 'REMOVED');

      // Calculate distribution (1-5 stars)
      const distribution = {
        5: activeFeedback.filter(f => f.overallRating === 5).length,
        4: activeFeedback.filter(f => f.overallRating === 4).length,
        3: activeFeedback.filter(f => f.overallRating === 3).length,
        2: activeFeedback.filter(f => f.overallRating === 2).length,
        1: activeFeedback.filter(f => f.overallRating === 1).length
      };

      // Calculate sentiment
      const positive = distribution[5] + distribution[4];
      const neutral = distribution[3];
      const negative = distribution[2] + distribution[1];

      // Calculate sub-rating averages
      let avgQuality = 0,
        avgPunctuality = 0,
        avgBehavior = 0;
      let qualityCount = 0,
        punctualityCount = 0,
        behaviorCount = 0;

      activeFeedback.forEach(f => {
        if (f.qualityRating) {
          avgQuality += f.qualityRating;
          qualityCount++;
        }
        if (f.punctualityRating) {
          avgPunctuality += f.punctualityRating;
          punctualityCount++;
        }
        if (f.behaviorRating) {
          avgBehavior += f.behaviorRating;
          behaviorCount++;
        }
      });

      if (qualityCount > 0) avgQuality /= qualityCount;
      if (punctualityCount > 0) avgPunctuality /= punctualityCount;
      if (behaviorCount > 0) avgBehavior /= behaviorCount;

      // Get recent feedback for summary
      const recentFeedback = activeFeedback.slice(0, 5).map(f => ({
        id: f.id,
        rating: f.overallRating,
        comment: f.comment,
        customerName: f.booking?.customer?.name,
        date: f.createdAt,
        wouldRecommend: f.wouldRecommend
      }));

      // Get monthly performance
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;

      const monthlyMetrics = [];
      for (let i = 5; i >= 0; i--) {
        let month = currentMonth - i;
        let year = currentYear;

        if (month <= 0) {
          month += 12;
          year -= 1;
        }

        const metric = await prisma.maidMonthlyPerformance.findUnique({
          where: {
            maidId_month_year: {
              maidId,
              month,
              year
            }
          }
        });

        monthlyMetrics.push({
          month,
          year,
          averageRating: metric?.averageRating || 0,
          totalRatings: metric?.totalRatings || 0,
          positiveCount: metric?.positiveCount || 0,
          feedbackCount: metric?.feedbackCount || 0
        });
      }

      // Get rating history if requested
      let ratingHistory = [];
      if (includeHistory) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        ratingHistory = await prisma.maidRatingHistory.findMany({
          where: {
            maidId,
            date: {
              gte: startDate
            }
          },
          orderBy: { date: 'asc' }
        });
      }

      // Calculate trend
      const trend = this.calculateTrend(ratingHistory);

      // Get platform average for comparison
      const allMaidProfiles = await prisma.maidProfile.findMany({
        select: { rating: true }
      });
      const platformAverage = allMaidProfiles.length > 0
        ? allMaidProfiles.reduce((sum, p) => sum + p.rating, 0) / allMaidProfiles.length
        : 0;

      return {
        maid: {
          id: maidId,
          name: maidUser.name,
          profileImage: maidUser.profileImage
        },
        currentRating: parseFloat(maidProfile.rating.toFixed(2)),
        totalRatings: maidProfile.totalRatings,
        comparisonWithPlatform: parseFloat((maidProfile.rating - platformAverage).toFixed(2)),
        platformAverage: parseFloat(platformAverage.toFixed(2)),
        distribution,
        sentiment: {
          positive: positive,
          neutral: neutral,
          negative: negative,
          positivePercentage: activeFeedback.length > 0 ? parseFloat(((positive / activeFeedback.length) * 100).toFixed(1)) : 0
        },
        subRatings: {
          quality: avgQuality ? parseFloat(avgQuality.toFixed(2)) : null,
          punctuality: avgPunctuality ? parseFloat(avgPunctuality.toFixed(2)) : null,
          behavior: avgBehavior ? parseFloat(avgBehavior.toFixed(2)) : null
        },
        feedbackCounts: {
          active: activeFeedback.length,
          disputed: disputedFeedback.length,
          resolved: resolvedFeedback.length,
          removed: removedFeedback.length,
          total: allFeedback.length
        },
        wouldRecommendCount: activeFeedback.filter(f => f.wouldRecommend === true).length,
        commentsCount: activeFeedback.filter(f => f.comment).length,
        recentFeedback,
        monthlyTrend: monthlyMetrics,
        trend,
        ratingHistory: includeHistory ? ratingHistory : null
      };
    } catch (error) {
      console.error('[FeedbackAnalyticsService] Error getting maid analytics:', error);
      throw error;
    }
  }

  /**
   * Generate monthly performance report for a maid
   */
  async generateMaidPerformanceReport(maidId, month, year) {
    try {
      // Get or create monthly performance
      let performance = await prisma.maidMonthlyPerformance.findUnique({
        where: {
          maidId_month_year: {
            maidId,
            month,
            year
          }
        }
      });

      if (!performance) {
        // Calculate from feedback
        performance = await this.calculateMonthlyPerformance(maidId, month, year);
      }

      // Get maid info
      const maidUser = await prisma.user.findUnique({
        where: { id: maidId },
        select: {
          name: true,
          email: true,
          profileImage: true,
          maidProfile: {
            select: {
              rating: true,
              totalRatings: true,
              completedBookings: true
            }
          }
        }
      });

      // Get feedback for the month
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);

      const monthFeedbacks = await prisma.feedback.findMany({
        where: {
          booking: {
            maidId,
            completedAt: {
              gte: startDate,
              lt: endDate
            }
          }
        },
        include: {
          booking: {
            select: {
              customer: {
                select: { name: true }
              }
            }
          }
        }
      });

      // Analyze feedback
      const analysis = {
        topComments: monthFeedbacks
          .filter(f => f.comment)
          .sort((a, b) => b.overallRating - a.overallRating)
          .slice(0, 3),
        improvements: monthFeedbacks
          .filter(f => f.improvements)
          .map(f => f.improvements),
        wouldRecommendPercentage:
          monthFeedbacks.length > 0
            ? parseFloat(
              ((monthFeedbacks.filter(f => f.wouldRecommend === true).length / monthFeedbacks.length) * 100).toFixed(1)
            )
            : 0
      };

      // Compare with previous month
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;

      const previousPerformance = await prisma.maidMonthlyPerformance.findUnique({
        where: {
          maidId_month_year: {
            maidId,
            month: prevMonth,
            year: prevYear
          }
        }
      });

      const comparison = {
        previousAverageRating: previousPerformance?.averageRating || 0,
        ratingChange: previousPerformance
          ? parseFloat((performance.averageRating - previousPerformance.averageRating).toFixed(2))
          : 0,
        previousFeedbackCount: previousPerformance?.feedbackCount || 0,
        feedbackCountChange: previousPerformance
          ? performance.feedbackCount - previousPerformance.feedbackCount
          : 0
      };

      // Calculate KPIs
      const kpis = {
        averageRating: parseFloat(performance.averageRating.toFixed(2)),
        feedbackResponseRate: maidUser?.maidProfile?.completedBookings > 0
          ? parseFloat(((performance.feedbackCount / maidUser.maidProfile.completedBookings) * 100).toFixed(1))
          : 0,
        positivePercentage: performance.feedbackCount > 0
          ? parseFloat((((performance.positiveCount / performance.feedbackCount) * 100)).toFixed(1))
          : 0,
        recommendationRate: analysis.wouldRecommendPercentage
      };

      return {
        period: {
          month,
          year,
          displayName: new Date(year, month - 1).toLocaleString('default', {
            month: 'long',
            year: 'numeric'
          })
        },
        maid: maidUser,
        performance,
        analysis,
        comparison,
        kpis,
        trend: previousPerformance
          ? comparison.ratingChange > 0.2
            ? 'IMPROVING'
            : comparison.ratingChange < -0.2
              ? 'DECLINING'
              : 'STABLE'
          : 'NEW'
      };
    } catch (error) {
      console.error('[FeedbackAnalyticsService] Error generating performance report:', error);
      throw error;
    }
  }

  /**
   * Calculate monthly performance metrics from feedback
   */
  async calculateMonthlyPerformance(maidId, month, year) {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);

      const feedbacks = await prisma.feedback.findMany({
        where: {
          booking: {
            maidId,
            completedAt: {
              gte: startDate,
              lt: endDate
            }
          },
          status: 'ACTIVE'
        },
        select: {
          overallRating: true,
          qualityRating: true,
          punctualityRating: true,
          behaviorRating: true,
          comment: true,
          wouldRecommend: true
        }
      });

      const feedbackCount = feedbacks.length;

      if (feedbackCount === 0) {
        // Create empty performance record
        return await prisma.maidMonthlyPerformance.create({
          data: {
            maidId,
            month,
            year,
            totalBookings: 0,
            totalRatings: 0,
            averageRating: 0,
            feedbackCount: 0
          }
        });
      }

      // Calculate metrics
      const avgRating = feedbacks.reduce((sum, f) => sum + f.overallRating, 0) / feedbackCount;
      const avgQuality = feedbacks.filter(f => f.qualityRating).length > 0
        ? feedbacks.reduce((sum, f) => sum + (f.qualityRating || 0), 0) / feedbacks.filter(f => f.qualityRating).length
        : null;
      const avgPunctuality = feedbacks.filter(f => f.punctualityRating).length > 0
        ? feedbacks.reduce((sum, f) => sum + (f.punctualityRating || 0), 0) / feedbacks.filter(f => f.punctualityRating).length
        : null;
      const avgBehavior = feedbacks.filter(f => f.behaviorRating).length > 0
        ? feedbacks.reduce((sum, f) => sum + (f.behaviorRating || 0), 0) / feedbacks.filter(f => f.behaviorRating).length
        : null;

      const positiveCount = feedbacks.filter(f => f.overallRating >= 4).length;
      const neutralCount = feedbacks.filter(f => f.overallRating === 3).length;
      const negativeCount = feedbacks.filter(f => f.overallRating < 3).length;
      const withCommentsCount = feedbacks.filter(f => f.comment).length;
      const recommendCount = feedbacks.filter(f => f.wouldRecommend === true).length;

      return await prisma.maidMonthlyPerformance.upsert({
        where: {
          maidId_month_year: {
            maidId,
            month,
            year
          }
        },
        create: {
          maidId,
          month,
          year,
          totalBookings: feedbackCount,
          totalRatings: feedbackCount,
          averageRating: parseFloat(avgRating.toFixed(2)),
          averageQuality: avgQuality ? parseFloat(avgQuality.toFixed(2)) : null,
          averagePunctuality: avgPunctuality ? parseFloat(avgPunctuality.toFixed(2)) : null,
          averageBehavior: avgBehavior ? parseFloat(avgBehavior.toFixed(2)) : null,
          positiveCount,
          neutralCount,
          negativeCount,
          feedbackCount,
          withCommentsCount,
          recommendCount
        },
        update: {
          averageRating: parseFloat(avgRating.toFixed(2)),
          averageQuality: avgQuality ? parseFloat(avgQuality.toFixed(2)) : null,
          averagePunctuality: avgPunctuality ? parseFloat(avgPunctuality.toFixed(2)) : null,
          averageBehavior: avgBehavior ? parseFloat(avgBehavior.toFixed(2)) : null,
          positiveCount,
          neutralCount,
          negativeCount,
          feedbackCount,
          withCommentsCount,
          recommendCount
        }
      });
    } catch (error) {
      console.error('[FeedbackAnalyticsService] Error calculating monthly performance:', error);
      throw error;
    }
  }

  /**
   * Calculate rating trend direction
   */
  calculateTrend(ratingHistory) {
    if (ratingHistory.length < 2) {
      return {
        direction: 'STABLE',
        change: 0,
        percentage: 0
      };
    }

    const firstHalf = ratingHistory.slice(0, Math.floor(ratingHistory.length / 2));
    const secondHalf = ratingHistory.slice(Math.floor(ratingHistory.length / 2));

    const avgFirst = firstHalf.reduce((sum, h) => sum + h.rating, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((sum, h) => sum + h.rating, 0) / secondHalf.length;

    const change = avgSecond - avgFirst;
    const percentage = avgFirst > 0 ? parseFloat(((change / avgFirst) * 100).toFixed(1)) : 0;

    return {
      direction: change > 0.1 ? 'IMPROVING' : change < -0.1 ? 'DECLINING' : 'STABLE',
      change: parseFloat(change.toFixed(2)),
      percentage
    };
  }

  /**
   * Get feedback statistics for admin dashboard
   */
  async getAdminFeedbackStats(filters = {}) {
    try {
      const { maidId = null, days = 30 } = filters;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const where = {
        createdAt: {
          gte: startDate
        }
      };

      if (maidId) {
        where.booking = { maidId };
      }

      // Total feedback
      const totalFeedback = await prisma.feedback.count({ where });

      // By status
      const byStatus = await prisma.feedback.groupBy({
        by: ['status'],
        where,
        _count: true
      });

      // Average rating
      const avgRating = await prisma.feedback.aggregate({
        where: {
          ...where,
          status: 'ACTIVE'
        },
        _avg: { overallRating: true }
      });

      // Rating distribution
      const distribution = await prisma.feedback.groupBy({
        by: ['overallRating'],
        where: {
          ...where,
          status: 'ACTIVE'
        },
        _count: true
      });

      // Disputed count
      const disputedCount = byStatus.find(s => s.status === 'DISPUTED')?._count || 0;

      // Most problematic maids
      const problemMaids = await prisma.booking.groupBy({
        by: ['maidId'],
        where: {
          feedback: {
            ...where,
            status: 'ACTIVE',
            overallRating: {
              lte: 2
            }
          }
        },
        _count: true,
        orderBy: {
          _count: {
            maidId: 'desc'
          }
        },
        take: 5
      });

      return {
        totalFeedback,
        averageRating: avgRating._avg.overallRating || 0,
        byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count])),
        distribution: Object.fromEntries(distribution.map(d => [d.overallRating, d._count])),
        disputedFeedbackCount: disputedCount,
        problemMaidCount: problemMaids.length
      };
    } catch (error) {
      console.error('[FeedbackAnalyticsService] Error getting admin stats:', error);
      throw error;
    }
  }
}

module.exports = new FeedbackAnalyticsService();
