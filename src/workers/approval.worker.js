const { createWorker } = require('./workerRunner');
const Wallet = require('../models/Wallet');
const Report = require('../models/Report');
const BlockchainService = require('../services/blockchain.service');
const NotificationService = require('../services/notification.service');
const User = require('../models/User');
const { ethers } = require('ethers');

const TASK_TYPE = 'analyze_approvals';
const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

// Standard ABIs for parsing approval transactions
const APPROVAL_ABIS = [
  'function approve(address spender, uint256 amount)',
  'function setApprovalForAll(address operator, bool approved)',
];
const approvalInterface = new ethers.Interface(APPROVAL_ABIS);

/**
 * Processes a single 'analyze_approvals' job by parsing transaction history.
 * @param {Job} job - The job object from the database.
 */
const processApprovalAnalysis = async (job) => {
  const { walletId } = job;
  const wallet = await Wallet.findById(walletId);

  if (!wallet) {
    throw new Error(`Wallet with ID ${walletId} not found.`);
  }

  console.log(`[ApprovalWorker] Starting transaction-based approval analysis for wallet: ${wallet.address}`);

  try {
    const transactions = wallet.transactionCache.txlist || [];
    const potentialApprovals = new Map(); // Using a map to store the latest approval for a given pair

    for (const tx of transactions) {
      // We only care about transactions sent *from* the user's wallet
      if (tx.from.toLowerCase() !== wallet.address.toLowerCase()) {
        continue;
      }

      const parsedTx = BlockchainService.parseTransactionInput(tx.input, approvalInterface);
      if (!parsedTx) {
        continue;
      }

      const { name, args } = parsedTx;
      const contractAddress = tx.to;

      if (name === 'approve') {
        const [spender, amount] = args;
        // Store the latest approval amount for this token-spender pair
        potentialApprovals.set(`${contractAddress}-${spender}`, { type: 'ERC20', contractAddress, spender, amount });
      } else if (name === 'setApprovalForAll') {
        const [operator, approved] = args;
        if (approved) {
          // Store that this operator was approved for this NFT collection
          potentialApprovals.set(`${contractAddress}-${operator}`, { type: 'NFT', contractAddress, operator });
        } else {
          // If user revokes approval, remove it from our list
          potentialApprovals.delete(`${contractAddress}-${operator}`);
        }
      }
    }

    const riskyApprovals = [];
    for (const [, approval] of potentialApprovals) {
      if (approval.type === 'ERC20') {
        const currentAllowance = await BlockchainService.getAllowance(approval.contractAddress, wallet.address, approval.spender, wallet.chain);
        if (currentAllowance > 0) {
          const isUnlimited = currentAllowance.toString() === MAX_UINT256;
          riskyApprovals.push({
            type: 'ERC20',
            tokenAddress: approval.contractAddress,
            spender: approval.spender,
            allowance: ethers.formatUnits(currentAllowance, 18), // Assuming 18 decimals, could be improved
            isUnlimited,
            riskLevel: isUnlimited ? 'high' : 'medium',
          });
        }
      } else if (approval.type === 'NFT') {
        const isStillApproved = await BlockchainService.isApprovedForAll(approval.contractAddress, wallet.address, approval.operator, wallet.chain);
        if (isStillApproved) {
          riskyApprovals.push({
            type: 'NFT',
            contractAddress: approval.contractAddress,
            operator: approval.operator,
            riskLevel: 'high',
          });
        }
      }
    }

    console.log(`[ApprovalWorker] Found ${riskyApprovals.length} active risky approvals for wallet: ${wallet.address}`);

    // --- Stateful Notification Logic ---
    const user = await User.findById(wallet.userId);
    const previousApprovals = new Set(wallet.lastAnalysisState.approvals || []);
    const currentApprovals = new Set();
    
    riskyApprovals.forEach(approval => {
      const identifier = approval.type === 'ERC20'
        ? `erc20-${approval.tokenAddress}-${approval.spender}`.toLowerCase()
        : `nft-${approval.contractAddress}-${approval.operator}`.toLowerCase();
      currentApprovals.add(identifier);

      // Check if this is a new, high-risk approval
      if (!previousApprovals.has(identifier) && (approval.isUnlimited || approval.type === 'NFT')) {
        const message = `
🚨 *New Risky Approval Detected* 🚨

Your wallet (*${wallet.label || wallet.address.substring(0, 6)}...*) has granted a new spending approval:

- *Type:* ${approval.type}
- *Contract:* \`${approval.type === 'ERC20' ? approval.tokenAddress : approval.contractAddress}\`
- *Spender:* \`${approval.type === 'ERC20' ? approval.spender : approval.operator}\`
- *Risk:* ${approval.isUnlimited ? 'UNLIMITED spending approval granted.' : 'Approval for the ENTIRE collection granted.'}

If you did not perform this action, consider revoking this approval.
        `;
        if (user && user.telegramChatId) {
          NotificationService.sendTelegramMessage(user.telegramChatId, message);
        }
      }
    });

    // Update the wallet's last analysis state
    wallet.lastAnalysisState.approvals = Array.from(currentApprovals);
    wallet.lastAnalysisState.lastUpdatedAt = new Date();
    await wallet.save();
    // --- End of Stateful Notification Logic ---

    if (riskyApprovals.length > 0) {
      await Report.findOneAndUpdate(
        { walletId: wallet._id },
        { $set: { 'details.approvalAnalysis': { count: riskyApprovals.length, items: riskyApprovals } } },
        { sort: { createdAt: -1 }, upsert: true }
      );
      console.log(`[ApprovalWorker] Updated report for wallet ${wallet.address}`);
    }

  } catch (error) {
    console.error(`[ApprovalWorker] Failed to process approvals for wallet ${wallet.address}:`, error.message);
    throw error;
  }
};

// Create and start the worker
createWorker(TASK_TYPE, processApprovalAnalysis);

// Export constants for re-use in other services
module.exports = {
  MAX_UINT256,
  APPROVAL_ABIS,
};