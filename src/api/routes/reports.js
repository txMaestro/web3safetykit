const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const Report = require('../../models/Report');
const Wallet = require('../../models/Wallet');
const LabelService = require('../../services/label.service');

// @route   GET api/v1/reports/wallet/:walletId
// @desc    Get the latest report for a specific wallet
// @access  Private
router.get('/wallet/:walletId', auth, async (req, res) => {
  try {
    const { walletId } = req.params;

    // 1. Find the wallet and verify ownership
    const wallet = await Wallet.findById(walletId);
    if (!wallet) {
      return res.status(404).json({ msg: 'Wallet not found' });
    }
    if (wallet.userId.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'User not authorized for this wallet' });
    }

    // 2. Find the latest report for this wallet
    const report = await Report.findOne({ walletId }).sort({ createdAt: -1 });
    if (!report) {
      return res.status(404).json({ msg: 'No report found for this wallet yet. Please try again later.' });
    }

    // 3. Collect all addresses from the report details for labeling
    const addressesByChain = { [wallet.chain]: new Set() };
    const reportDetails = report.details || {};

    for (const key in reportDetails) {
        const alerts = reportDetails[key] || [];
        alerts.forEach(alert => {
            if(alert.spender) addressesByChain[wallet.chain].add(alert.spender);
            if(alert.tokenAddress) addressesByChain[wallet.chain].add(alert.tokenAddress);
            if(alert.operator) addressesByChain[wallet.chain].add(alert.operator);
            if(alert.address) addressesByChain[wallet.chain].add(alert.address);
        });
    }
    // Also add the wallet address itself to be labeled
    addressesByChain[wallet.chain].add(wallet.address);


    // 4. Fetch labels
    const labels = await LabelService.getLabels(Array.from(addressesByChain[wallet.chain]), wallet.chain);

    // 5. Enrich the report details with labels
    const enrichedDetails = {};
    for (const key in reportDetails) {
        enrichedDetails[key] = reportDetails[key].map(alert => ({
            ...alert,
            spenderLabel: alert.spender ? (labels.get(alert.spender.toLowerCase()) || 'Unknown') : undefined,
            tokenLabel: alert.tokenAddress ? (labels.get(alert.tokenAddress.toLowerCase()) || 'Unknown') : undefined,
            operatorLabel: alert.operator ? (labels.get(alert.operator.toLowerCase()) || 'Unknown') : undefined,
            contractLabel: alert.address ? (labels.get(alert.address.toLowerCase()) || 'Unknown') : undefined,
            positionLabel: alert.address ? (labels.get(alert.address.toLowerCase()) || 'Unknown') : undefined,
        }));
    }
    
    const enrichedReport = {
        ...report.toObject(),
        details: enrichedDetails,
        walletLabel: labels.get(wallet.address.toLowerCase()) || 'Unknown'
    };

    res.json(enrichedReport);

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;