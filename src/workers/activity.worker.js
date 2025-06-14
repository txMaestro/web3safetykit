const { createWorker } = require('./workerRunner');
const Wallet = require('../models/Wallet');
const Report = require('../models/Report');
const User = require('../models/User');
const NotificationService = require('../services/notification.service');

const TASK_TYPE = 'analyze_activity';

/**
 * Calculates a risk score based on the report details.
 * @param {object} details - The details object from the report.
 * @returns {number} - A risk score from 0 to 100.
 */
const calculateRiskScore = (details) => {
  let score = 0;

  // 1. Approval risks (Max 40 points)
  if (details.approvalAnalysis && details.approvalAnalysis.items) {
    const unlimitedCount = details.approvalAnalysis.items.filter(a => a.isUnlimited).length;
    const limitedCount = details.approvalAnalysis.items.length - unlimitedCount;
    score += Math.min(unlimitedCount * 10, 30); // 10 points per unlimited approval, max 30
    score += Math.min(limitedCount * 2, 10);   // 2 points per limited approval, max 10
  }

  // 2. Contract risks (Max 40 points)
  if (details.contractAnalysis) {
    const unverifiedCount = details.contractAnalysis.unverifiedContracts.length;
    const riskyKeywordCount = details.contractAnalysis.verifiedContractsWithRisks.length;
    score += Math.min(unverifiedCount * 5, 25); // 5 points per unverified contract, max 25
    score += Math.min(riskyKeywordCount * 3, 15); // 3 points per risky contract, max 15
  }

  // 3. Transaction activity risks (Max 20 points)
  if (details.activityMetrics) {
    if (details.activityMetrics.transactionCount < 10) {
      score += 10; // Low activity might be risky
    }
    if (details.activityMetrics.walletAgeDays < 30) {
      score += 10; // Very new wallet is a potential risk
    }
  }

  return Math.min(score, 100); // Cap the score at 100
};


/**
 * Processes a single 'analyze_activity' job.
 * @param {Job} job - The job object from the database.
 */
const processActivityAnalysis = async (job) => {
  const { walletId } = job;
  const wallet = await Wallet.findById(walletId);

  if (!wallet) {
    throw new Error(`Wallet with ID ${walletId} not found.`);
  }

  console.log(`[ActivityWorker] Starting activity analysis and risk scoring for wallet: ${wallet.address}`);

  try {
    // Find the latest report to get all details
    const report = await Report.findOne({ walletId }).sort({ createdAt: -1 });

    if (!report || !report.details) {
      console.warn(`[ActivityWorker] Report for wallet ${wallet.address} not found or is empty. Skipping scoring.`);
      return;
    }

    // --- Start of Activity Metrics Calculation ---
    const txlist = wallet.transactionCache.txlist || [];
    let activityMetrics = {};

    if (txlist.length > 0) {
      const firstTxTimestamp = parseInt(txlist[0].timeStamp, 10);
      const lastTxTimestamp = parseInt(txlist[txlist.length - 1].timeStamp, 10);
      const walletAgeDays = (lastTxTimestamp - firstTxTimestamp) / (60 * 60 * 24);
      
      const uniqueAddresses = new Set();
      txlist.forEach(tx => {
        uniqueAddresses.add(tx.from.toLowerCase());
        uniqueAddresses.add(tx.to.toLowerCase());
      });
      // Remove the wallet's own address from the set of interacted addresses
      uniqueAddresses.delete(wallet.address.toLowerCase());

      activityMetrics = {
        transactionCount: txlist.length,
        firstTransactionDate: new Date(firstTxTimestamp * 1000).toISOString(),
        lastTransactionDate: new Date(lastTxTimestamp * 1000).toISOString(),
        walletAgeDays: Math.round(walletAgeDays),
        uniqueInteractedAddresses: uniqueAddresses.size,
      };
    } else {
       activityMetrics = {
        transactionCount: 0,
        walletAgeDays: 0,
        uniqueInteractedAddresses: 0,
      };
    }
    
    report.details.activityMetrics = activityMetrics;
    // --- End of Activity Metrics Calculation ---

    const riskScore = calculateRiskScore(report.details);
    
    report.riskScore = riskScore;
    report.summary = `Wallet analysis complete. Overall risk score: ${riskScore}/100.`;
        
    await report.save();

    console.log(`[ActivityWorker] Successfully calculated risk score (${riskScore}) and updated report for wallet: ${wallet.address}`);

    // General notification has been removed. Specific workers now send stateful notifications.

  } catch (error) {
    console.error(`[ActivityWorker] Failed to process activity for wallet ${wallet.address}:`, error.message);
    throw error;
  }
};

// Create and start the worker
createWorker(TASK_TYPE, processActivityAnalysis);