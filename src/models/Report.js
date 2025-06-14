const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
  },
  riskScore: {
    type: Number,
    required: true,
  },
  summary: {
    type: String,
    required: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed, // To store detailed findings from all workers
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

ReportSchema.index({ walletId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);