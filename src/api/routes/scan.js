const express = require('express');
const router = express.Router();
const ScanService = require('../../services/scan.service');
const { ethers } = require('ethers');
const auth = require('../../middleware/auth');
const User = require('../../models/User');

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

// @route   POST /api/v1/scan/user
// @desc    Perform a full, authenticated scan for the logged-in user's wallet
// @access  Private
router.post('/user', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    // The user's primary wallet address is used for the scan
    const { walletAddress } = user;

    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ msg: 'A valid wallet address is required for the user' });
    }

    // We can reuse the performGuestScan logic as it's a comprehensive on-demand scan.
    // The difference for authenticated users is that their full history might be
    // processed in the background by workers, but this provides an instant result.
    const results = await ScanService.performGuestScan(walletAddress);
    res.json(results);

  } catch (error) {
    console.error(`[UserScan] Error: ${error.message}`);
    res.status(500).json({ msg: 'An error occurred during the scan.' });
  }
});

module.exports = router;