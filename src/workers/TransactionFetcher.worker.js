const { createWorker } = require('./workerRunner');
const JobService = require('../services/JobService');
const Wallet = require('../models/Wallet');
const BlockchainService = require('../services/blockchain.service');

const TASK_TYPE = 'fetch_transactions';

/**
 * Fetches all transaction types for a wallet and caches them in the Wallet document.
 * After fetching, it triggers the individual analysis jobs.
 * @param {Job} job - The job object from the database.
 */
const processFetchTransactions = async (job) => {
  const { walletId } = job;
  const wallet = await Wallet.findById(walletId);

  if (!wallet) {
    throw new Error(`Wallet with ID ${walletId} not found for transaction fetching.`);
  }

  console.log(`[TxFetcherWorker] Starting incremental transaction fetch for wallet: ${wallet.address}`);

  try {
    const cache = wallet.transactionCache;
    const isInitialScan = (cache.lastBlock.txlist || 0) === 0;
    const maxTx = parseInt(process.env.INITIAL_SCAN_MAX_TX, 10) || 1000;

    let fetchPromises;

    if (isInitialScan) {
      console.log(`[TxFetcherWorker] Performing initial scan for wallet ${wallet.address}, fetching last ${maxTx} transactions.`);
      const fetchOptions = { sort: 'desc', offset: maxTx };
      fetchPromises = [
        BlockchainService.getTransactions(wallet.address, wallet.chain, fetchOptions),
        BlockchainService.getTokenTransfers(wallet.address, wallet.chain, fetchOptions),
        BlockchainService.getNftTransfers(wallet.address, wallet.chain, fetchOptions)
      ];
    } else {
      console.log(`[TxFetcherWorker] Performing incremental update for wallet ${wallet.address}.`);
      const startBlocks = {
        txlist: (cache.lastBlock.txlist || 0) + 1,
        tokentx: (cache.lastBlock.tokentx || 0) + 1,
        tokennfttx: (cache.lastBlock.tokennfttx || 0) + 1,
      };
      fetchPromises = [
        BlockchainService.getTransactions(wallet.address, wallet.chain, { startblock: startBlocks.txlist }),
        BlockchainService.getTokenTransfers(wallet.address, wallet.chain, { startblock: startBlocks.tokentx }),
        BlockchainService.getNftTransfers(wallet.address, wallet.chain, { startblock: startBlocks.tokennfttx })
      ];
    }

    // 1. Fetch transactions based on the logic above
    const [newTxlist, newTokentx, newNfttx] = await Promise.all(fetchPromises);

    // 2. Append new data to the existing cache and update last block numbers
    if (newTxlist && newTxlist.length > 0) {
      cache.txlist = (cache.txlist || []).concat(newTxlist);
      cache.lastBlock.txlist = Math.max(...newTxlist.map(tx => parseInt(tx.blockNumber, 10)));
    }
    if (newTokentx && newTokentx.length > 0) {
      cache.tokentx = (cache.tokentx || []).concat(newTokentx);
      cache.lastBlock.tokentx = Math.max(...newTokentx.map(tx => parseInt(tx.blockNumber, 10)));
    }
    if (newNfttx && newNfttx.length > 0) {
      cache.tokennfttx = (cache.tokennfttx || []).concat(newNfttx);
      cache.lastBlock.tokennfttx = Math.max(...newNfttx.map(tx => parseInt(tx.blockNumber, 10)));
    }
    
    cache.updatedAt = new Date();
    wallet.markModified('transactionCache'); // Important: Mongoose needs this to detect changes in nested objects
    await wallet.save();

    console.log(`[TxFetcherWorker] Fetched and cached ${newTxlist.length} new normal txs, ${newTokentx.length} new token txs, and ${newNfttx.length} new NFT txs.`);

    // 3. Now that data is cached, trigger the actual analysis workers
    const analysisTasks = [
      'analyze_approvals',
      'analyze_contracts',
      'analyze_activity',
      'analyze_lp_stake',
    ];

    for (const taskType of analysisTasks) {
      await JobService.createJob(walletId, taskType);
    }
    
    console.log(`[TxFetcherWorker] Triggered subsequent analysis jobs for wallet: ${wallet.address}`);

  } catch (error) {
    console.error(`[TxFetcherWorker] Failed to fetch or cache transactions for wallet ${wallet.address}:`, error.message);
    // Re-throw the error to let the job runner mark it as failed
    throw error;
  }
};

// Create and start the worker
createWorker(TASK_TYPE, processFetchTransactions, 10000);