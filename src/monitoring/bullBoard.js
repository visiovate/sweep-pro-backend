const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { assignmentQueue } = require('../queues/assignmentQueue');
const { adminReassignQueue } = require('../queues/adminReassignQueue');

/**
 * Bull Board Integration for Job Visualization
 * 
 * This provides a web-based dashboard to monitor and manage BullMQ queues.
 * Access it at: http://localhost:3000/admin/queues
 */

// Create Express adapter for Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

// Create Bull Board with all queues
const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [
    new BullAdapter(assignmentQueue),
    new BullAdapter(adminReassignQueue),
  ],
  serverAdapter: serverAdapter,
});

// Remove all serverAdapter.get, post, delete, etc. endpoint definitions and just export the dashboard adapter + controls for the queues.

console.log('📊 Bull Board initialized');
console.log('🔗 Queue Dashboard: http://localhost:3000/admin/queues');
console.log('🏥 Health Check: http://localhost:3000/health');

module.exports = {
  serverAdapter,
  addQueue,
  removeQueue,
  setQueues,
  replaceQueues,
};


