const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createIssue = async (req, res) => {
  try {
    const { bookingId, type, description, priority, title, category } = req.body;
    const reportedBy = req.user.id;

    // Validate required fields
    if (!bookingId || !type || !description || !priority || !title || !category) {
      return res.status(400).json({
        error: 'Missing required fields: bookingId, type, description, priority, title, category'
      });
    }

    // Validate enums
    const validTypes = [
      'SERVICE_QUALITY', 'MAID_BEHAVIOR', 'TIMING_ISSUE', 'PAYMENT_ISSUE',
      'TECHNICAL_ISSUE', 'SAFETY_CONCERN', 'DAMAGE_CLAIM', 'OTHER'
    ];
    const validCategories = [
      'CUSTOMER_COMPLAINT', 'MAID_COMPLAINT', 'SYSTEM_ISSUE',
      'BILLING_ISSUE', 'SAFETY_INCIDENT'
    ];
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: 'Invalid issue type. Must be one of: ' + validTypes.join(', ')
      });
    }

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: 'Invalid issue category. Must be one of: ' + validCategories.join(', ')
      });
    }

    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        error: 'Invalid issue priority. Must be one of: ' + validPriorities.join(', ')
      });
    }

    // Verify booking exists
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, customerId: true, maidId: true }
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Check if user is either customer or maid for this booking
    if (booking.customerId !== reportedBy && booking.maidId !== reportedBy) {
      return res.status(403).json({ error: 'Unauthorized: You can only report issues for your own bookings' });
    }

    const issue = await prisma.issue.create({
      data: {
        bookingId,
        reportedBy,
        type,
        description,
        priority,
        category,
        title,
        status: 'OPEN'
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: { id: true, name: true, email: true }
            },
            maid: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        reporter: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.status(201).json(issue);
  } catch (error) {
    console.error('Error creating issue:', error);
    res.status(500).json({ message: 'Failed to create issue' });
  }
};

const getAllIssues = async (req, res) => {
  try {
    const issues = await prisma.issue.findMany({
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: { id: true, name: true, email: true }
            },
            maid: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        reporter: {
          select: { id: true, name: true, email: true }
        },
        resolver: {
          select: { id: true, name: true, email: true }
        }
      }
    });
    res.json(issues);
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ message: 'Failed to fetch issues' });
  }
};

const getIssueById = async (req, res) => {
  try {
    const { id } = req.params;
    const issue = await prisma.issue.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: { id: true, name: true, email: true }
            },
            maid: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        reporter: {
          select: { id: true, name: true, email: true }
        },
        resolver: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    res.json(issue);
  } catch (error) {
    console.error('Error fetching issue:', error);
    res.status(500).json({ message: 'Failed to fetch issue' });
  }
};

const updateIssueStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body;
    const resolvedBy = req.user.id;

    const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const issue = await prisma.issue.update({
      where: { id },
      data: {
        status,
        resolution,
        resolvedBy,
        resolvedAt: new Date()
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: { id: true, name: true, email: true }
            },
            maid: {
              select: { id: true, name: true, email: true }
            }
          }
        },
        reporter: {
          select: { id: true, name: true, email: true }
        },
        resolver: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.json(issue);
  } catch (error) {
    console.error('Error updating issue status:', error);
    res.status(500).json({ message: 'Failed to update issue status' });
  }
};

const getUserIssues = async (req, res) => {
  try {
    const userId = req.user.id;
    const issues = await prisma.issue.findMany({
      where: {
        reportedBy: userId
      },
      include: {
        booking: {
          include: {
            service: true
          }
        }
      }
    });
    res.json(issues);
  } catch (error) {
    console.error('Error fetching user issues:', error);
    res.status(500).json({ message: 'Failed to fetch user issues' });
  }
};

module.exports = {
  createIssue,
  getAllIssues,
  getIssueById,
  updateIssueStatus,
  getUserIssues
};
