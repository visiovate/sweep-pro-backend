/**
 * Daily Booking Automation Script
 *
 * This module is the programmatic entry point for the daily booking automation
 * that the admin panel can trigger manually (POST /api/admin/run-daily-automation).
 *
 * The same logic also runs on a cron schedule via AutomaticServiceScheduler:
 *   - scheduleDailyServices()  → runs at 06:00 each day
 *   - assignMaidsToServices()  → runs at 07:00 each day
 *
 * This file was previously missing, causing the server to crash at startup with
 * "Cannot find module '../scripts/daily-booking-automation'".
 */

const AutomaticServiceScheduler = require('../services/AutomaticServiceScheduler');

/**
 * Run the complete daily booking automation pipeline:
 *  1. scheduleDailyServices  — creates tomorrow's bookings for active subscriptions
 *  2. assignMaidsToServices  — assigns an available maid to each unassigned booking
 *
 * Returns a summary object compatible with the adminAssignmentController
 * runDailyAutomation endpoint which expects { created, skipped, errors, ... }.
 *
 * @returns {Promise<{created: number, skipped: number, errors: number, results: any[], skippedDetails: any[], errorDetails: any[]}>}
 */
async function runDailyBookingAutomation() {
  const scheduler = new AutomaticServiceScheduler();

  const results = [];
  const skippedDetails = [];
  const errorDetails = [];

  let created = 0;
  let skipped = 0;
  let errors = 0;

  try {
    console.log('\n🤖 [DailyAutomation] Step 1/2: Scheduling daily services...');
    const scheduleResult = await scheduler.scheduleDailyServices();

    // scheduleDailyServices uses executeWithErrorHandling — it may return undefined
    // on success (void path) or throw. We treat a clean return as "no hard errors".
    results.push({ step: 'scheduleDailyServices', status: 'ok', detail: scheduleResult });
    // We don't have per-customer counters from scheduleDailyServices yet —
    // the method logs internally. Mark overall step as 1 created for visibility.
    created += 1;
  } catch (err) {
    errors += 1;
    errorDetails.push({ step: 'scheduleDailyServices', error: err.message });
    console.error('❌ [DailyAutomation] scheduleDailyServices failed:', err.message);
  }

  try {
    console.log('\n🤖 [DailyAutomation] Step 2/2: Assigning maids to bookings...');
    const assignResult = await scheduler.assignMaidsToServices();

    results.push({ step: 'assignMaidsToServices', status: 'ok', detail: assignResult });
    created += 1;
  } catch (err) {
    errors += 1;
    errorDetails.push({ step: 'assignMaidsToServices', error: err.message });
    console.error('❌ [DailyAutomation] assignMaidsToServices failed:', err.message);
  }

  console.log(`\n✅ [DailyAutomation] Complete — steps ok: ${created}, errors: ${errors}`);

  return {
    created,
    skipped,
    errors,
    results,
    skippedDetails,
    errorDetails,
  };
}

module.exports = { runDailyBookingAutomation };
