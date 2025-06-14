const { createWorker } = require('./workerRunner');
const JobService = require('../services/JobService');
const Wallet = require('../models/Wallet');

const TASK_TYPE = 'full_scan';

/**
 * Processes a 'full_scan' job by creating sub-tasks for all individual analyses.
 * @param {Job} job - The job object from the database.
 */
const processFullScan = async (job) => {
  const { walletId } = job;
  const wallet = await Wallet.findById(walletId);

  if (!wallet) {
    throw new Error(`Wallet with ID ${walletId} not found during full scan.`);
  }

  console.log(`[FullScanWorker] Starting full scan for wallet: ${wallet.address}`);

  // Instead of creating all analysis jobs, it now only creates the transaction fetching job.
  // The TransactionFetcher.worker will then trigger the individual analysis jobs.
  await JobService.createJob(walletId, 'fetch_transactions');

  // The lastScanAt will be updated by the individual workers or a finalizer worker later.
  // For now, we can consider the "scan" initiated.
  wallet.lastScanAt = new Date();
  await wallet.save();

  console.log(`[FullScanWorker] Created 'fetch_transactions' job for wallet: ${wallet.address}`);
};

// Create and start the worker
createWorker(TASK_TYPE, processFullScan, 10000); // Check less frequently