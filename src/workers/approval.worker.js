const { createWorker } = require('./workerRunner');
const Wallet = require('../models/Wallet');
const Report = require('../models/Report');
const BlockchainService = require('../services/blockchain.service');
const NotificationService = require('../services/notification.service');
const LabelService = require('../services/label.service');
const User = require('../models/User');
const { ethers } = require('ethers');

const TASK_TYPE = 'analyze_approvals';
const MAX_UINT256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

// ABIs for parsing various types of approval-related transactions
const APPROVAL_ABIS = [
  // Standard ERC20/ERC721 approvals
  'function approve(address spender, uint256 amount)',
  'function setApprovalForAll(address operator, bool approved)',

  // EIP-2612 Permit (gasless approvals)
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)',

  // Uniswap's Permit2 single permit
  'function permit(address, ((address, uint256), uint256, uint256), bytes)',
  
  // Uniswap's Permit2 batch permit
  'function permit(((address,uint256)[],uint256,uint256),bytes)',

  // Common Permit2 interaction functions
  'function permitTransferFrom(((address,uint256),uint256,address),address,bytes)',
  'function permitWitnessTransferFrom(((address,uint256),uint256,address),address,bytes32,string,bytes)'
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
          potentialApprovals.set(`${contractAddress}-${operator}`, { type: 'NFT', contractAddress, operator });
        } else {
          potentialApprovals.delete(`${contractAddress}-${operator}`);
        }
      } else if (name === 'permit') {
        // This can be EIP-2612 or Permit2, we'll check args
        const spender = args[1]; // Spender is consistently the second argument in EIP-2612
        const deadline = args[3]; // Deadline is the fourth argument
        
        // Check if deadline is far in the future (e.g., > 1 year from now)
        const oneYearFromNow = Math.floor(Date.now() / 1000) + 31536000;
        const isLongLived = deadline && BigInt(deadline.toString()) > BigInt(oneYearFromNow);

        if (isLongLived) {
            potentialApprovals.set(`${contractAddress}-${spender}`, { type: 'Permit', contractAddress, spender, deadline: deadline.toString(), isLongLived });
        }
      } else if (name.toLowerCase().includes('permittransferfrom')) {
        // This is a Permit2 interaction, which is a standing approval.
        // The spender is the contract being interacted with (tx.to)
        const spender = tx.to;
        potentialApprovals.set(`${contractAddress}-${spender}`, { type: 'Permit2', contractAddress, spender });
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
            revoke: {
              target: approval.contractAddress,
              calldata: approvalInterface.encodeFunctionData('approve', [approval.spender, 0]),
            }
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
            revoke: {
              target: approval.contractAddress,
              calldata: approvalInterface.encodeFunctionData('setApprovalForAll', [approval.operator, false]),
            }
          });
        }
      } else if (approval.type === 'Permit' && approval.isLongLived) {
        // For now, we assume a long-lived permit is an active risk.
        // A more advanced check could try to verify the nonce.
        riskyApprovals.push({
            type: 'Permit',
            tokenAddress: approval.contractAddress,
            spender: approval.spender,
            deadline: new Date(approval.deadline * 1000).toISOString(),
            riskLevel: 'medium',
            isUnlimited: false, // Permit is for a specific amount, but can be long-lived
        });
      } else if (approval.type === 'Permit2') {
        // Permit2 is a standing approval on the Permit2 contract itself.
        // We can check the allowance on the Permit2 contract for the user's wallet.
        // Note: This requires knowing the official Permit2 contract address.
        // For now, we'll just flag the interaction as an informational risk.
        riskyApprovals.push({
            type: 'Permit2 Interaction',
            contractAddress: approval.contractAddress, // The contract that USES Permit2
            spender: approval.spender,
            riskLevel: 'medium',
            isUnlimited: false,
        });
      }
    }

    console.log(`[ApprovalWorker] Found ${riskyApprovals.length} active risky approvals for wallet: ${wallet.address}`);

    // --- Enrich with Labels ---
    const addressesToLabel = new Set();
    riskyApprovals.forEach(approval => {
      if (approval.tokenAddress) addressesToLabel.add(approval.tokenAddress);
      if (approval.contractAddress) addressesToLabel.add(approval.contractAddress);
      if (approval.spender) addressesToLabel.add(approval.spender);
      if (approval.operator) addressesToLabel.add(approval.operator);
    });

    const labels = await LabelService.getLabels(Array.from(addressesToLabel), wallet.chain);
    const getDisplayName = (address) => {
      if (!address) return 'Unknown';
      const label = labels.get(address.toLowerCase());
      return label && label !== 'Unknown' ? label : `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    };

    // Add labels to the risky approvals for the report
    riskyApprovals.forEach(approval => {
      if (approval.tokenAddress) approval.tokenLabel = getDisplayName(approval.tokenAddress);
      if (approval.contractAddress) approval.contractLabel = getDisplayName(approval.contractAddress);
      if (approval.spender) approval.spenderLabel = getDisplayName(approval.spender);
      if (approval.operator) approval.operatorLabel = getDisplayName(approval.operator);
    });
    // --- End of Enrichment ---


    // --- Stateful Notification Logic ---
    const user = await User.findById(wallet.userId);
    const previousApprovals = new Set(wallet.lastAnalysisState.approvals || []);
    const currentApprovals = new Set();
    
    riskyApprovals.forEach(approval => {
      const identifier = `${approval.type}-${approval.tokenAddress || approval.contractAddress}-${approval.spender || approval.operator}`.toLowerCase();
      currentApprovals.add(identifier);

      // Check if this is a new, medium-to-high-risk approval
      if (!previousApprovals.has(identifier) && (approval.riskLevel === 'high' || approval.riskLevel === 'medium')) {
        let riskDescription = '';
        const spenderName = getDisplayName(approval.spender || approval.operator);
        const contractName = getDisplayName(approval.tokenAddress || approval.contractAddress);

        if (approval.isUnlimited) {
            riskDescription = `UNLIMITED spending approval granted to ${spenderName}.`;
        } else if (approval.type === 'NFT') {
            riskDescription = `Approval for the ENTIRE ${contractName} collection granted to ${spenderName}.`;
        } else if (approval.type === 'Permit') {
            riskDescription = `Long-lived 'Permit' signature granted to ${spenderName} until ${new Date(approval.deadline).toLocaleDateString()}.`;
        } else if (approval.type === 'Permit2 Interaction') {
            riskDescription = `Interaction with ${contractName}, which may represent a standing approval via Permit2.`;
        }

        const message = `
        
⚠️ *New Spending Approval Detected* ⚠️

Your wallet (*${wallet.label || wallet.address.substring(0, 6)}...*) has a new spending approval:

- *Type:* ${approval.type}
- *Contract:* ${contractName}
- *Spender:* ${spenderName}
- *Risk:* ${riskDescription}

If this is unexpected, review and consider revoking the approval.
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