const BlockchainService = require('./blockchain.service');
const { ethers } = require('ethers');
const GuestScanCache = require('../models/GuestScanCache');
const LabelService = require('./label.service');

// Re-using risk definitions from workers to keep consistency
const { RISK_KEYWORDS, RISKY_SIGNATURES, analyzeHoneypotIndicators } = require('../workers/contract.worker');
const { MAX_UINT256, APPROVAL_ABIS } = require('../workers/approval.worker');
const { LP_STAKE_ABIS } = require('../workers/lpStake.worker');

const approvalInterface = new ethers.Interface(APPROVAL_ABIS);
const lpStakeInterface = new ethers.Interface(LP_STAKE_ABIS);

class ScanService {
  /**
   * Performs a comprehensive, in-memory scan for a given wallet address across all supported chains.
   * @param {string} walletAddress - The wallet address to scan.
   * @returns {Promise<object>} - A formatted summary of the scan results for the frontend.
   */
  static async performGuestScan(walletAddress) {
    const cacheKey = walletAddress.toLowerCase();
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    // 1. Check for a recent, valid cache entry
    const cachedScan = await GuestScanCache.findOne({ walletAddress: cacheKey });
    if (cachedScan && cachedScan.lastScannedAt > twelveHoursAgo) {
      console.log(`[ScanService] Returning cached result for ${walletAddress}`);
      return cachedScan.lastScanResult;
    }

    console.log(`[ScanService] Starting fresh multi-chain guest scan for ${walletAddress}`);
    
    const supportedChains = [
      'ethereum',
      'base',
      'polygon',
      'arbitrum',
      'zksync'
    ];
    const rawResults = {};

    const scanPromises = supportedChains.map(async (chain) => {
      try {
        const maxTx = 250; // Guest scan is always limited to 250 transactions for speed.
        const transactions = await BlockchainService.getTransactions(walletAddress, chain, { sort: 'desc', offset: maxTx });

        if (!Array.isArray(transactions)) {
          const errorMessage = typeof transactions === 'string' ? transactions : 'Invalid response from block explorer API.';
          return { chain, error: errorMessage };
        }
        if (transactions.length === 0) return { chain, data: null };

        const [approvals, contracts, lpPositions] = await Promise.all([
          this.analyzeApprovals(walletAddress, transactions, chain),
          this.analyzeContracts(walletAddress, transactions, chain),
          this.analyzeLpPositions(walletAddress, transactions, chain),
        ]);

        return { chain, data: { approvals, contracts, lpPositions } };
      } catch (error) {
        console.error(`[ScanService] Error scanning ${chain} for ${walletAddress}:`, error.message);
        return { chain, error: `Failed to scan this chain: ${error.message}` };
      }
    });

    const settledResults = await Promise.allSettled(scanPromises);
    settledResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        rawResults[result.value.chain] = result.value;
      }
    });

    // 3. Group addresses by chain and fetch labels in parallel
    const addressesByChain = {};
    for (const chain in rawResults) {
      const result = rawResults[chain];
      if (result.data) {
        if (!addressesByChain[chain]) {
          addressesByChain[chain] = new Set();
        }
        result.data.approvals.forEach(a => {
          if (a.spender) addressesByChain[chain].add(a.spender);
          if (a.tokenAddress) addressesByChain[chain].add(a.tokenAddress);
          if (a.contractAddress) addressesByChain[chain].add(a.contractAddress);
          if (a.operator) addressesByChain[chain].add(a.operator);
        });
        result.data.contracts.forEach(c => {
          addressesByChain[chain].add(c.address);
        });
        result.data.lpPositions.forEach(lp => {
          addressesByChain[chain].add(lp.address);
        });
      }
    }

    const labelPromises = Object.entries(addressesByChain).map(([chain, addresses]) => {
      return LabelService.getLabels(Array.from(addresses), chain);
    });

    const settledLabelResults = await Promise.allSettled(labelPromises);
    const allLabels = new Map();
    settledLabelResults.forEach(result => {
      if (result.status === 'fulfilled') {
        for (const [address, label] of result.value.entries()) {
          allLabels.set(address.toLowerCase(), label);
        }
      }
    });

    const formattedResult = this.formatResultsForFrontend(rawResults, allLabels);

    // Add the label for the wallet address itself
    formattedResult.overview.walletLabel = allLabels.get(walletAddress.toLowerCase()) || 'Unknown';

    // 4. Save the new result to the cache
    await GuestScanCache.findOneAndUpdate(
      { walletAddress: cacheKey },
      {
        lastScanResult: formattedResult,
        lastScannedAt: new Date(),
      },
      { upsert: true, new: true }
    );
    console.log(`[ScanService] Saved new scan result to cache for ${walletAddress}`);

    return formattedResult;
  }

  static async analyzeApprovals(walletAddress, transactions, chain) {
    const results = [];
    for (const tx of transactions) {
      if (!tx || !tx.from || typeof tx.from !== 'string' || tx.from.toLowerCase() !== walletAddress.toLowerCase()) continue;
      const parsedTx = BlockchainService.parseTransactionInput(tx.input, approvalInterface);
      if (!parsedTx) continue;

      const { name, args } = parsedTx;

      if (name === 'approve' && args[1].toString() === MAX_UINT256) {
        results.push({
          type: 'High Risk Approval',
          description: `Unlimited ERC20 approval granted to ${args[0]}`,
          tokenAddress: tx.to,
          spender: args[0],
          txHash: tx.hash,
          risk: 90,
          revoke: {
            target: tx.to,
            calldata: approvalInterface.encodeFunctionData('approve', [args[0], 0]),
          }
        });
      } else if (name === 'setApprovalForAll' && args[1] === true) {
        results.push({
          type: 'High Risk Approval',
          description: `Collection-wide NFT approval granted to ${args[0]}`,
          contractAddress: tx.to,
          operator: args[0],
          txHash: tx.hash,
          risk: 80,
          revoke: {
            target: tx.to,
            calldata: approvalInterface.encodeFunctionData('setApprovalForAll', [args[0], false]),
          }
        });
      } else if (name === 'permit') {
        const deadline = args[3]; // Deadline is the fourth argument in EIP-2612
        const oneYearFromNow = Math.floor(Date.now() / 1000) + 31536000;
        if (deadline && BigInt(deadline.toString()) > BigInt(oneYearFromNow)) {
          results.push({
            type: 'Medium Risk Approval',
            description: `Long-lived 'Permit' signature granted to ${args[1]}`,
            tokenAddress: tx.to,
            spender: args[1],
            txHash: tx.hash,
            risk: 65
          });
        }
      } else if (name.toLowerCase().includes('permittransferfrom')) {
        results.push({
          type: 'Informational',
          description: `Interaction with Permit2-enabled contract ${tx.to}`,
          contractAddress: tx.to,
          txHash: tx.hash,
          risk: 40
        });
      }
    }
    return results;
  }

  static async analyzeContracts(walletAddress, transactions, chain) {
    const results = [];
    const interactedContracts = [...new Set(transactions.map(tx => tx.to).filter(Boolean))];
    for (const proxyAddress of interactedContracts) {
      // Determine the address to analyze: implementation for proxies, or the original address
      const implementationAddress = await BlockchainService.getImplementationAddress(proxyAddress, chain);
      const addressToAnalyze = implementationAddress || proxyAddress;

      const sourceCodeData = await BlockchainService.getSourceCode(addressToAnalyze, chain);
      if (sourceCodeData && sourceCodeData.SourceCode) {
        const originalSourceCode = sourceCodeData.SourceCode;
        const lowerCaseSourceCode = originalSourceCode.toLowerCase();

        // Honeypot analysis
        const honeypotIndicators = analyzeHoneypotIndicators(originalSourceCode);
        if (honeypotIndicators.hiddenApprove) {
          results.push({ address: proxyAddress, type: 'Critical Honeypot Alert', description: 'This contract contains a hidden approve function and is likely malicious.', txHash: transactions.find(t => t.to === proxyAddress)?.hash, risk: 100 });
          continue;
        }
        if (honeypotIndicators.details.length > 0) {
          results.push({ address: proxyAddress, type: 'Suspicious Contract', description: `Honeypot indicators found: ${honeypotIndicators.details.join(' ')}`, txHash: transactions.find(t => t.to === proxyAddress)?.hash, risk: 75 });
        }

        // Standard keyword analysis
        const foundKeywords = RISK_KEYWORDS.HIGH.filter(k => lowerCaseSourceCode.includes(k));
        if (foundKeywords.length > 0) {
          results.push({ address: proxyAddress, type: 'High Risk Contract Interaction', description: `Verified contract with keywords: ${foundKeywords.join(', ')}`, txHash: transactions.find(t => t.to === proxyAddress)?.hash, risk: 85 });
        }
      } else {
        const bytecode = await BlockchainService.getCode(addressToAnalyze, chain);
        if (!bytecode) continue;
        const foundSignatures = [];
        for (const sig in RISKY_SIGNATURES.HIGH) {
          if (bytecode.includes(RISKY_SIGNATURES.HIGH[sig].substring(2))) {
            foundSignatures.push(sig);
          }
        }
        if (foundSignatures.length > 0) {
          results.push({ address: proxyAddress, type: 'High Risk Contract Interaction', description: `Unverified contract with functions: ${foundSignatures.join(', ')}`, txHash: transactions.find(t => t.to === proxyAddress)?.hash, risk: 95 });
        }
      }
    }
    return results;
  }

  static async analyzeLpPositions(walletAddress, transactions, chain) {
    const results = [];
    const checkedContracts = new Set();
    for (const tx of transactions) {
      if (!tx || !tx.from || typeof tx.from !== 'string' || tx.from.toLowerCase() !== walletAddress.toLowerCase() || !tx.to) continue;
      const parsedTx = BlockchainService.parseTransactionInput(tx.input, lpStakeInterface);
      if (!parsedTx || checkedContracts.has(tx.to)) continue;

      checkedContracts.add(tx.to);
      results.push({ address: tx.to, type: 'Forgotten Liquidity Pool', description: `Potential LP/Staking position in ${tx.to}`, txHash: tx.hash, risk: 35 });
    }
    return results;
  }

  static formatResultsForFrontend(rawResults, labels = new Map()) {
    const formatted = {
      overview: {
        totalValue: 'N/A', // Not implemented
        riskScore: 0,
        activeApprovals: 0,
        stakedAssets: 0, // Using LP positions for this
        lpPositions: 0,
        lastScan: new Date().toISOString(),
        walletLabel: 'Unknown', // Add a default value
      },
      alertsByChain: {},
    };

    let totalRisk = 0;
    let totalAlerts = 0;

    for (const chain in rawResults) {
      const result = rawResults[chain];
      if (result.error || !result.data) {
        formatted.alertsByChain[chain] = { error: result.error || 'No data found.' };
        continue;
      }

      const { approvals, contracts, lpPositions } = result.data;
      
      // A helper to get a display name (label or formatted address)
      const getDisplayName = (address) => {
        if (!address) return 'Unknown';
        const label = labels.get(address.toLowerCase());
        return label && label !== 'Unknown' ? label : `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
      };

      // Add labels and update descriptions
      approvals.forEach(a => {
        if (a.spender) a.spenderLabel = labels.get(a.spender.toLowerCase()) || 'Unknown';
        if (a.tokenAddress) a.tokenLabel = labels.get(a.tokenAddress.toLowerCase()) || 'Unknown';
        if (a.contractAddress) a.contractLabel = labels.get(a.contractAddress.toLowerCase()) || 'Unknown';
        if (a.operator) a.operatorLabel = labels.get(a.operator.toLowerCase()) || 'Unknown';

        // Re-write descriptions with labels
        if (a.description.startsWith('Unlimited ERC20')) {
          a.description = `Unlimited ERC20 approval granted to ${getDisplayName(a.spender)}`;
        } else if (a.description.startsWith('Collection-wide')) {
          a.description = `Collection-wide NFT approval granted to ${getDisplayName(a.operator)}`;
        } else if (a.description.startsWith('Long-lived')) {
          a.description = `Long-lived 'Permit' signature granted to ${getDisplayName(a.spender)}`;
        } else if (a.description.startsWith('Interaction with Permit2')) {
          a.description = `Interaction with Permit2-enabled contract ${getDisplayName(a.contractAddress)}`;
        }
      });
      contracts.forEach(c => {
        c.contractLabel = labels.get(c.address.toLowerCase()) || 'Unknown';
        const displayName = getDisplayName(c.address);
        if (c.description.startsWith('Unverified contract')) {
          c.description = `Unverified contract (${displayName}) with functions: ${c.description.split(': ')[1]}`;
        } else if (c.description.startsWith('Verified contract')) {
          c.description = `Verified contract (${displayName}) with keywords: ${c.description.split(': ')[1]}`;
        } else if (c.description.startsWith('Honeypot indicators')) {
          c.description = `Honeypot indicators found in ${displayName}: ${c.description.split(': ')[1]}`;
        }
      });
      lpPositions.forEach(lp => {
        lp.positionLabel = labels.get(lp.address.toLowerCase()) || 'Unknown';
        lp.description = `Potential LP/Staking position in ${getDisplayName(lp.address)}`;
      });

      const allAlerts = [...approvals, ...contracts, ...lpPositions];

      formatted.alertsByChain[chain] = { alerts: allAlerts };

      formatted.overview.activeApprovals += approvals.length;
      formatted.overview.lpPositions += lpPositions.length;

      allAlerts.forEach(alert => {
        totalRisk += alert.risk;
        totalAlerts++;
      });
    }

    // Calculate final risk score (average risk of all alerts, capped at 100)
    formatted.overview.riskScore = totalAlerts > 0 ? Math.min(Math.round(totalRisk / totalAlerts), 100) : 0;
    formatted.overview.stakedAssets = formatted.overview.lpPositions; // As per decision

    return formatted;
  }
}

module.exports = ScanService;