const BlockchainService = require('./blockchain.service');
const AiService = require('./ai.service');
const LabelService = require('./label.service');
const ContractAnalysis = require('../models/ContractAnalysis');

// Re-using risk definitions from workers to keep consistency
const { RISK_KEYWORDS, RISKY_SIGNATURES, analyzeHoneypotIndicators } = require('../workers/contract.worker');

class ContractAnalysisService {
  /**
   * Analyzes a single smart contract for security risks, using a cache-first approach.
   * @param {string} contractAddress - The address of the contract to analyze.
   * @param {string} chain - The blockchain the contract is on.
   * @returns {Promise<object>} - The detailed analysis result.
   */
  static async analyzeContract(contractAddress, chain) {
    const address = contractAddress.toLowerCase();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 1. Check for a recent, valid cache entry in our database
    const cachedAnalysis = await ContractAnalysis.findOne({
      contractAddress: address,
      chain: chain,
      lastAnalyzedAt: { $gte: twentyFourHoursAgo },
    });

    if (cachedAnalysis) {
      console.log(`[ContractAnalysisService] Returning cached result for ${address} on ${chain}`);
      return cachedAnalysis;
    }

    console.log(`[ContractAnalysisService] Performing fresh analysis for ${address} on ${chain}`);

    // 2. Perform a fresh analysis
    const implementationAddress = await BlockchainService.getImplementationAddress(address, chain);
    const addressToAnalyze = implementationAddress || address;

    const sourceCodeData = await BlockchainService.getSourceCode(addressToAnalyze, chain);
    let analysisResult;

    if (sourceCodeData && sourceCodeData.SourceCode) {
      analysisResult = await this.analyzeVerifiedContract(sourceCodeData.SourceCode);
    } else {
      const bytecode = await BlockchainService.getCode(addressToAnalyze, chain);
      analysisResult = this.analyzeUnverifiedContract(bytecode);
    }

    // 3. Enrich the result with labels and other metadata
    const label = await LabelService.getLabel(address, chain);

    const finalResult = {
      contractAddress: address,
      chain,
      label: label || 'Unknown',
      analysis: {
        ...analysisResult,
        isProxy: !!implementationAddress,
        implementationAddress: implementationAddress,
      },
      lastAnalyzedAt: new Date(),
    };

    // 4. Save the new result to the database cache
    const newAnalysis = await ContractAnalysis.findOneAndUpdate(
      { contractAddress: address, chain: chain },
      finalResult,
      { upsert: true, new: true }
    );

    console.log(`[ContractAnalysisService] Saved new analysis to cache for ${address} on ${chain}`);
    return newAnalysis;
  }

  /**
   * Analyzes the source code of a verified contract.
   * @param {string} sourceCode - The contract's source code.
   * @returns {Promise<object>} - A structured analysis object.
   */
  static async analyzeVerifiedContract(sourceCode) {
    const lowerCaseSourceCode = sourceCode.toLowerCase();
    
    const keywordRisks = {
      HIGH: RISK_KEYWORDS.HIGH.filter(k => lowerCaseSourceCode.includes(k)),
      MEDIUM: RISK_KEYWORDS.MEDIUM.filter(k => lowerCaseSourceCode.includes(k)),
      LOW: RISK_KEYWORDS.LOW.filter(k => lowerCaseSourceCode.includes(k)),
    };

    const honeypotIndicators = analyzeHoneypotIndicators(sourceCode);

    const needsAiAnalysis = keywordRisks.HIGH.length > 0 || keywordRisks.MEDIUM.length > 0 || honeypotIndicators.hiddenApprove;
    const aiSummary = needsAiAnalysis
      ? await AiService.analyzeContract(sourceCode)
      : 'No high/medium risks found, AI analysis skipped.';

    return {
      sourceCodeVerified: true,
      risks: keywordRisks,
      honeypotIndicators,
      aiSummary,
      reason: 'Contract source code analyzed.',
    };
  }

  /**
   * Analyzes the bytecode of an unverified contract.
   * @param {string} bytecode - The contract's bytecode.
   * @returns {object} - A structured analysis object.
   */
  static analyzeUnverifiedContract(bytecode) {
    if (!bytecode || bytecode === '0x') {
      return {
        sourceCodeVerified: false,
        risks: { HIGH: [], MEDIUM: [], LOW: [] },
        honeypotIndicators: {},
        aiSummary: 'Cannot analyze, contract has no bytecode (EOA or destroyed).',
        reason: 'Contract has no bytecode.',
      };
    }

    const foundRisks = { HIGH: [], MEDIUM: [], LOW: [] };
    for (const level in RISKY_SIGNATURES) {
      for (const signature in RISKY_SIGNATURES[level]) {
        const selector = RISKY_SIGNATURES[level][signature];
        if (bytecode.includes(selector.substring(2))) { // remove '0x'
          foundRisks[level].push(signature);
        }
      }
    }

    return {
      sourceCodeVerified: false,
      risks: foundRisks,
      honeypotIndicators: {},
      aiSummary: 'Source code is not verified. Analysis is based on function signatures found in the bytecode.',
      reason: 'Unverified contract with potentially risky function signatures.',
    };
  }
}

module.exports = ContractAnalysisService;