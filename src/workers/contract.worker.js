const { createWorker } = require('./workerRunner');
const Wallet = require('../models/Wallet');
const Report = require('../models/Report');
const BlockchainService = require('../services/blockchain.service');
const AiService = require('../services/ai.service');
const NotificationService = require('../services/notification.service');
const User = require('../models/User');

const TASK_TYPE = 'analyze_contracts';
const RISK_KEYWORDS = {
  HIGH: [
    'selfdestruct',   // Can destroy the contract
    'delegatecall',   // Can execute code from another contract with the context of the current contract
    'callcode',       // Deprecated version of delegatecall
    'tx.origin',      // Can be manipulated in phishing attacks
    'ecrecover',      // Can be misused for signature replay attacks
  ],
  MEDIUM: [
    'reentrancy',     // A known attack vector if not properly guarded
    'assembly',       // Inline assembly can bypass Solidity's safety checks
    'create2',        // Can be used to deploy contracts at pre-computed addresses
    'iszero',         // Can be used for bypassing checks in older Solidity versions
  ],
  LOW: [
    'shadows',        // State variable shadowing can be confusing and lead to errors
    'hidden',         // To remind that 'private' is not truly private on-chain
    'onlyowner',      // Common pattern, but could indicate centralization
    'mint',           // Indicates token creation capabilities
    'burn',           // Indicates token destruction capabilities
  ],
};

const RISKY_SIGNATURES = {
  HIGH: {
    'delegatecall(bytes)': '0x592ac5a6',
    'upgradeTo(address)': '0x3659cfe6',
    'upgradeToAndCall(address,bytes)': '0x4f1ef286',
    'setOwner(address)': '0x13af4035',
    'kill()': '0xc01a7570',          // Common name for selfdestruct
    'destroy()': '0x83197ef0',       // Common name for selfdestruct
    'rug()': '0x93252358',           // Explicit rug pull function
    'exit()': '0xe9b28907',          // Can be used for malicious exit liquidity
  },
  MEDIUM: {
    'setApprovalForAll(address,bool)': '0xa22cb465',
    'approve(address,uint256)': '0x095ea7b3',
    'transferFrom(address,address,uint256)': '0x23b872dd',
    'multicall(bytes[])': '0xac9650d8',
    'emergencyWithdraw()': '0xbb295b77', // Can be a backdoor for owner
  },
  LOW: {
    'mint(address,uint256)': '0x40c10f19',
    'burn(address,uint256)': '0x9dc29fac',
    'pause()': '0x8456cb59',
    'unpause()': '0x3f4ba83a',
  }
};


/**
 * Processes a single 'analyze_contracts' job.
 * @param {Job} job - The job object from the database.
 */
const processContractAnalysis = async (job) => {
  const { walletId } = job;
  const wallet = await Wallet.findById(walletId);

  if (!wallet) {
    throw new Error(`Wallet with ID ${walletId} not found.`);
  }

  console.log(`[ContractWorker] Starting contract analysis for wallet: ${wallet.address} on chain: ${wallet.chain}`);

  try {
    const transactions = wallet.transactionCache.txlist || [];
    const interactedContracts = [...new Set(transactions.map(tx => tx.to).filter(Boolean))];

    const analysisResults = {
      unverifiedContracts: [],
      unverifiedWithRisks: [],
      verifiedContractsWithRisks: [],
    };

    for (const contractAddress of interactedContracts) {
      const implementationAddress = await BlockchainService.getImplementationAddress(contractAddress, wallet.chain);
      const addressToAnalyze = implementationAddress || contractAddress;
      
      const sourceCodeData = await BlockchainService.getSourceCode(addressToAnalyze, wallet.chain);
      
      if (!sourceCodeData.SourceCode) {
        const contractBytecode = await BlockchainService.getCode(addressToAnalyze, wallet.chain);
        const foundRisks = { HIGH: [], MEDIUM: [], LOW: [] };

        for (const level in RISKY_SIGNATURES) {
          for (const signature in RISKY_SIGNATURES[level]) {
            const selector = RISKY_SIGNATURES[level][signature];
            if (contractBytecode.includes(selector.substring(2))) { // remove '0x'
              foundRisks[level].push(signature);
            }
          }
        }
      
        const totalRisks = foundRisks.HIGH.length + foundRisks.MEDIUM.length + foundRisks.LOW.length;
        if (totalRisks > 0) {
          analysisResults.unverifiedWithRisks.push({
            address: contractAddress,
            isProxy: !!implementationAddress,
            implementationAddress: implementationAddress,
            risks: foundRisks,
            reason: 'Unverified contract with potentially risky function signatures.'
          });
        } else {
          analysisResults.unverifiedContracts.push({
            address: contractAddress,
            reason: 'Contract is not verified and no known risky signatures found.',
            isProxy: !!implementationAddress,
            implementationAddress: implementationAddress,
          });
        }
        continue;
      }

      const originalSourceCode = sourceCodeData.SourceCode;
      const lowerCaseSourceCode = originalSourceCode.toLowerCase();
      
      // Perform keyword-based risk analysis
      const keywordRisks = {
        HIGH: RISK_KEYWORDS.HIGH.filter(k => lowerCaseSourceCode.includes(k)),
        MEDIUM: RISK_KEYWORDS.MEDIUM.filter(k => lowerCaseSourceCode.includes(k)),
        LOW: RISK_KEYWORDS.LOW.filter(k => lowerCaseSourceCode.includes(k)),
      };
      
      // Perform honeypot-specific analysis
      const honeypotIndicators = analyzeHoneypotIndicators(originalSourceCode);

      const totalKeywordRisks = keywordRisks.HIGH.length + keywordRisks.MEDIUM.length + keywordRisks.LOW.length;
      const hasHoneypotIndicators = honeypotIndicators.hiddenApprove || honeypotIndicators.hardcodedAddress || honeypotIndicators.obfuscatedLogic;

      if (totalKeywordRisks > 0 || hasHoneypotIndicators) {
        // Determine if AI analysis is needed
        const needsAiAnalysis = keywordRisks.HIGH.length > 0 || keywordRisks.MEDIUM.length > 0 || hasHoneypotIndicators;
        const aiSummary = needsAiAnalysis
          ? await AiService.analyzeContract(originalSourceCode)
          : 'No high/medium risks found, AI analysis skipped.';
        
        analysisResults.verifiedContractsWithRisks.push({
          address: contractAddress,
          implementationAddress: implementationAddress,
          isProxy: !!implementationAddress,
          risks: keywordRisks,
          honeypotIndicators: honeypotIndicators,
          aiSummary: aiSummary,
        });
      }
    }

    console.log(`[ContractWorker] Analysis complete. Found: ${analysisResults.unverifiedContracts.length} unverified, ${analysisResults.unverifiedWithRisks.length} unverified with risks, ${analysisResults.verifiedContractsWithRisks.length} verified with risks.`);

    // --- Stateful Notification Logic ---
    const user = await User.findById(wallet.userId);
    const previousContracts = new Set(wallet.lastAnalysisState.interactedContracts || []);

    // Notify for new, verified contracts with HIGH risk keywords
    for (const contract of analysisResults.verifiedContractsWithRisks) {
      if (!previousContracts.has(contract.address.toLowerCase()) && contract.risks.HIGH.length > 0) {
        let riskReason = `High-risk keywords found: *${contract.risks.HIGH.join(', ')}*`;
        let messageTitle = 'HIGH-RISK CONTRACT INTERACTION';
        let additionalWarning = '';

        if (contract.honeypotIndicators?.hiddenApprove) {
            messageTitle = 'CRITICAL HONEYPOT ALERT';
            additionalWarning = '\n\n*CRITICAL WARNING: This contract contains a hidden approval function and is likely a honeypot designed to steal your funds.*';
        } else if (contract.honeypotIndicators?.details.length > 0) {
            additionalWarning = `\n\n*Honeypot Indicators:* ${contract.honeypotIndicators.details.join(' ')}`;
        }

        const message = `
‼️ *${messageTitle}* ‼️

Your wallet (*${wallet.label || wallet.address.substring(0, 6)}...*) has interacted with a new *high-risk* contract:

- *Contract Address:* \`${contract.address}\`
- *Detected Risk:* ${riskReason}
- *AI Summary:* ${contract.aiSummary.substring(0, 200)}...${additionalWarning}

This contract could be extremely dangerous. Please proceed with caution.
        `;
        if (user && user.telegramChatId) {
          NotificationService.sendTelegramMessage(user.telegramChatId, message);
        }
      }
    }

    // Notify for new, unverified contracts with HIGH risk signatures
    for (const contract of analysisResults.unverifiedWithRisks) {
      if (!previousContracts.has(contract.address.toLowerCase()) && contract.risks.HIGH.length > 0) {
        const riskReason = `High-risk function signatures found in unverified contract: *${contract.risks.HIGH.join(', ')}*`;
        const message = `
‼️ *HIGH-RISK CONTRACT INTERACTION* ‼️

Your wallet (*${wallet.label || wallet.address.substring(0, 6)}...*) has interacted with a new, potentially *high-risk, unverified* contract:

- *Contract Address:* \`${contract.address}\`
- *Detected Risk:* ${riskReason}
- *Warning:* This contract's source code is not verified and may contain dangerous functions.

Please review any permissions granted to this contract and consider revoking them.
        `;
        if (user && user.telegramChatId) {
          NotificationService.sendTelegramMessage(user.telegramChatId, message);
        }
      }
    }

    // Update the wallet's last analysis state with all interacted contracts
    wallet.lastAnalysisState.interactedContracts = interactedContracts.map(c => c.toLowerCase());
    await wallet.save();
    // --- End of Stateful Notification Logic ---

    if (analysisResults.unverifiedContracts.length > 0 || analysisResults.verifiedContractsWithRisks.length > 0 || analysisResults.unverifiedWithRisks.length > 0) {
      await Report.findOneAndUpdate(
        { walletId: wallet._id },
        { $set: { 'details.contractAnalysis': analysisResults } },
        { sort: { createdAt: -1 }, new: true, upsert: true }
      );
      console.log(`[ContractWorker] Updated report for wallet ${wallet.address} with contract analysis.`);
    }

  } catch (error) {
    console.error(`[ContractWorker] Failed to process contracts for wallet ${wallet.address}:`, error.message);
    throw error;
  }
};

// Create and start the worker
createWorker(TASK_TYPE, processContractAnalysis);

// Export constants for re-use in other services
module.exports = {
  RISK_KEYWORDS,
  RISKY_SIGNATURES,
  analyzeHoneypotIndicators, // Exporting the new function
};