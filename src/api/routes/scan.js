const express = require('express');
const router = express.Router();
const ScanService = require('../../services/scan.service');
const { ethers } = require('ethers');

// @route   POST /api/v1/scan/guest
// @desc    Perform a limited, non-authenticated scan for a wallet address
// @access  Public
router.post('/guest', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ msg: 'A valid wallet address is required' });
    }

    // The service now handles all supported chains automatically
    const results = await ScanService.performGuestScan(walletAddress);
    res.json(results);

  } catch (error) {
    console.error(`[GuestScan] Error: ${error.message}`);
    res.status(500).json({ msg: 'An error occurred during the scan.' });
  }
});

module.exports = router;