const cron = require('node-cron');
const Wallet = require('../models/Wallet');
const JobService = require('../services/JobService');
const mongoose = require('mongoose');

const SCAN_INTERVAL_HOURS = process.env.SCAN_INTERVAL_HOURS || 24; // Default to 24 hours

/**
 * This scheduler finds all wallets and creates a 'full_scan' job for each of them
 * based on the SCAN_INTERVAL_HOURS environment variable.
 */
function startMasterScheduler() {
  // Validate that the interval is a number
  if (isNaN(SCAN_INTERVAL_HOURS) || SCAN_INTERVAL_HOURS <= 0) {
    console.warn('[Scheduler] Invalid or missing SCAN_INTERVAL_HOURS. Scheduler will not run.');
    return;
  }

  console.log(`[Scheduler] Master scheduler will run every ${SCAN_INTERVAL_HOURS} hours.`);

  // The cron expression for running every N hours
  const cronExpression = `0 */${SCAN_INTERVAL_HOURS} * * *`;

  cron.schedule(cronExpression, async () => {
    console.log('[Scheduler] Running scheduled wallet scan...');
    
    if (mongoose.connection.readyState !== 1) {
        console.error('[Scheduler] MongoDB is not connected. Skipping scan.');
        return;
    }

    try {
      const wallets = await Wallet.find({}).select('_id address').lean();
      console.log(`[Scheduler] Found ${wallets.length} wallets to scan.`);

      for (const wallet of wallets) {
        try {
          await JobService.createJob(wallet._id, 'full_scan');
          console.log(`[Scheduler] Created full_scan job for wallet ${wallet.address} (${wallet._id})`);
        } catch (jobError) {
          console.error(`[Scheduler] Failed to create job for wallet ${wallet._id}:`, jobError);
        }
      }
      console.log('[Scheduler] Finished creating scan jobs for all wallets.');
    } catch (error) {
      console.error('[Scheduler] An error occurred during the scheduled scan:', error);
    }
  });
}

module.exports = { startMasterScheduler };