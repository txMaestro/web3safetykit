const { createWorker } = require('./workerRunner');
const Wallet = require('../models/Wallet');
const Report = require('../models/Report');
const BlockchainService = require('../services/blockchain.service');
const { ethers } = require('ethers');

const TASK_TYPE = 'analyze_lp_stake';

// Common function signatures for liquidity and staking
const LP_STAKE_ABIS = [
  'function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline)',
  'function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline)',
  'function stake(uint256 amount)',
  'function deposit(uint256 amount)',
  'function deposit(uint256 _value, address _to)',
];
const lpStakeInterface = new ethers.Interface(LP_STAKE_ABIS);

/**
 * Processes a single 'analyze_lp_stake' job by parsing transaction history.
 * @param {Job} job - The job object from the database.
 */
const processLpStakeAnalysis = async (job) => {
  const { walletId } = job;
  const wallet = await Wallet.findById(walletId);

  if (!wallet) {
    throw new Error(`Wallet with ID ${walletId} not found.`);
  }

  console.log(`[LpStakeWorker] Starting transaction-based LP/Stake analysis for wallet: ${wallet.address}`);

  try {
    const transactions = wallet.transactionCache.txlist || [];
    const foundPositions = [];
    const checkedContracts = new Set();

    for (const tx of transactions) {
      if (tx.from.toLowerCase() !== wallet.address.toLowerCase() || !tx.to) {
        continue;
      }

      const parsedTx = BlockchainService.parseTransactionInput(tx.input, lpStakeInterface);
      if (!parsedTx) {
        continue;
      }

      const contractAddress = tx.to;
      // Avoid adding the same contract multiple times
      if (checkedContracts.has(contractAddress)) {
        continue;
      }
      checkedContracts.add(contractAddress);

      foundPositions.push({
        contractAddress: contractAddress,
        functionCalled: parsedTx.name,
        transactionHash: tx.hash,
      });
    }

    console.log(`[LpStakeWorker] Found ${foundPositions.length} potential LP/Staking interactions.`);

    if (foundPositions.length > 0) {
      // Here, we just identify the interaction. A full implementation would then
      // query the user's balance or staked amount in these contracts.
      // For MVP, identifying the potential platform is a huge step.
      await Report.findOneAndUpdate(
        { walletId: wallet._id },
        { $set: { 'details.lpStakeAnalysis': { count: foundPositions.length, items: foundPositions } } },
        { sort: { createdAt: -1 }, upsert: true }
      );
      console.log(`[LpStakeWorker] Updated report for wallet ${wallet.address} with LP/Stake analysis.`);
    }

  } catch (error) {
    console.error(`[LpStakeWorker] Failed to process LP/Stake analysis for wallet ${wallet.address}:`, error.message);
    throw error;
  }
};

// Create and start the worker
createWorker(TASK_TYPE, processLpStakeAnalysis);

// Export constants for re-use in other services
module.exports = {
  LP_STAKE_ABIS,
};