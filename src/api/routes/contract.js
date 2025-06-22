const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const ContractAnalysisService = require('../../services/contractAnalysis.service');

const SUPPORTED_CHAINS = ['ethereum', 'base', 'polygon', 'arbitrum', 'zksync'];

// @route   POST /api/v1/contract/analyze
// @desc    Analyze a single smart contract for risks
// @access  Public
router.post('/analyze', async (req, res) => {
  try {
    const { contractAddress, chain } = req.body;

    // 1. Validate input
    if (!contractAddress || !ethers.isAddress(contractAddress)) {
      return res.status(400).json({ msg: 'A valid contract address is required' });
    }
    if (!chain || !SUPPORTED_CHAINS.includes(chain.toLowerCase())) {
      return res.status(400).json({ msg: `Invalid or unsupported chain. Supported chains are: ${SUPPORTED_CHAINS.join(', ')}` });
    }

    // 2. Call the service to perform analysis
    const results = await ContractAnalysisService.analyzeContract(contractAddress, chain.toLowerCase());
    
    // 3. Return the results
    res.json(results);

  } catch (error) {
    console.error(`[ContractAnalyzeRoute] Error: ${error.message}`);
    res.status(500).json({ msg: 'An error occurred during the contract analysis.' });
  }
});

module.exports = router;