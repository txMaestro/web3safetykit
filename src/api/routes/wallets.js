const express = require('express');
const router = express.Router();
const Wallet = require('../../models/Wallet');
const JobService = require('../../services/JobService');
const auth = require('../../middleware/auth');

// @route   POST api/wallets
// @desc    Add a new wallet for a user
// @access  Private
router.post('/', auth, async (req, res) => {
  const { address, label } = req.body;
  const userId = req.user.id;

  // Basic validation
  if (!address) {
    return res.status(400).json({ msg: 'Please provide a wallet address' });
  }

  // List of all supported chains to scan
  const supportedChains = ['ethereum', 'polygon', 'arbitrum', 'base', 'zksync'];
  const results = [];

  try {
    for (const chain of supportedChains) {
      // Find or create a wallet for each chain
      let wallet = await Wallet.findOneAndUpdate(
        { userId, address, chain },
        { $setOnInsert: { userId, address, chain, label } },
        { new: true, upsert: true }
      );

      // Create a new scan job for this wallet (on this chain)
      const job = await JobService.createJob(wallet._id, 'full_scan');
      
      results.push({
        msg: `Scan initiated for ${address} on ${chain}.`,
        wallet,
        jobId: job._id
      });
    }

    res.status(201).json({
      msg: `Scans initiated for address ${address} on all supported chains.`,
      results
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/wallets/:id/scan
// @desc    Trigger a new full scan for a wallet
// @access  Private
router.post('/:id/scan', auth, async (req, res) => {
  try {
    const wallet = await Wallet.findById(req.params.id);

    if (!wallet) {
      return res.status(404).json({ msg: 'Wallet not found' });
    }

    // Ensure user owns wallet
    if (wallet.userId.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    const job = await JobService.createJob(wallet._id, 'full_scan');

    res.json({
      msg: `New scan initiated for wallet ${wallet.address}.`,
      jobId: job._id
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


// @route   DELETE api/wallets/:id
// @desc    Delete a wallet
// @access  Private
router.delete('/:id', auth, async (req, res) => {
    try {
        const wallet = await Wallet.findById(req.params.id);

        if (!wallet) {
            return res.status(404).json({ msg: 'Wallet not found' });
        }

        // Ensure user owns wallet
        if (wallet.userId.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        await wallet.deleteOne();

        // Optional: Clean up related jobs and reports
        // await Job.deleteMany({ walletId: req.params.id });
        // await Report.deleteMany({ walletId: req.params.id });

        res.json({ msg: 'Wallet removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;