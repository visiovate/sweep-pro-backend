const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createIssue = async (req, res) => {
  try {
    const { bookingId, type, description, priority } = req.body;
    const reportedBy = req.user.id;

    const issue = await prisma.issue.create({
      data: {
        bookingId,
        reportedBy,
        type,
        description,
        priority,
        status: 'OPEN'
      },
      include: {
        booking: {
          include: {
            service: true,
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            maid: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true
          }
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
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            maid: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        resolver: {
          select: {
            id: true,
            name: true,
            email: true
          }
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
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            maid: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        resolver: {
          select: {
            id: true,
            name: true,
            email: true
          }
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

    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
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
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            maid: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        reporter: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        resolver: {
          select: {
            id: true,
            name: true,
            email: true
          }
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