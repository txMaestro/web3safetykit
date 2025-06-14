const express = require('express');
const router = express.Router();
const AuthService = require('../../services/auth.service');
const { ethers } = require('ethers');

// @route   GET /api/v1/auth/nonce/:walletAddress
// @desc    Get a one-time nonce for signing
// @access  Public
router.get('/nonce/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    if (!ethers.isAddress(walletAddress)) {
      return res.status(400).json({ msg: 'Invalid wallet address' });
    }
    const message = await AuthService.generateNonce(walletAddress);
    res.json({ message });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/v1/auth/verify
// @desc    Verify a signed message, create/login user, and return JWT
// @access  Public
router.post('/verify', async (req, res) => {
  try {
    const { walletAddress, signature } = req.body;
    if (!walletAddress || !signature) {
      return res.status(400).json({ msg: 'Wallet address and signature are required' });
    }

    const { token, user } = await AuthService.verifySignature(walletAddress, signature);
    res.json({ token, user });
  } catch (error) {
    console.error(error.message);
    res.status(401).json({ msg: error.message }); // Use 401 for auth errors
  }
});

module.exports = router;