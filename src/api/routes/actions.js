const express = require('express');
const router = express.Router();
const ActionService = require('../../services/ActionService');

/**
 * @route   POST /api/v1/actions/revoke
 * @desc    Logs a user-initiated revoke transaction for analytics.
 * @access  Public (but requires a connected wallet on the frontend)
 */
router.post('/revoke', async (req, res) => {
  try {
    const { walletAddress, chain, tokenAddress, spender, txHash } = req.body;

    const requiredFields = { walletAddress, chain, tokenAddress, spender, txHash };
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.status(400).json({ msg: `Bad Request: Missing required field '${field}'.` });
      }
    }

    const action = await ActionService.logRevokeAction(req.body);
    res.status(201).json({ msg: 'Revoke action logged successfully.', data: action });
  } catch (error) {
    console.error('Error logging revoke action:', error.message);
    // Handle potential duplicate key error for txHash
    if (error.code === 11000) {
      return res.status(409).json({ msg: 'Conflict: This transaction hash has already been logged.' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;