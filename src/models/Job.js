const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
  walletId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true,
  },
  taskType: {
    type: String,
    required: true,
    enum: [
      'analyze_approvals',
      'analyze_contracts',
      'analyze_activity',
      'analyze_lp_stake',
      'full_scan',
      'fetch_transactions',
    ],
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  payload: {
    type: mongoose.Schema.Types.Mixed, // For any additional data
  },
  attempts: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  processedAt: {
    type: Date,
  },
});

JobSchema.index({ status: 1, taskType: 1 });

module.exports = mongoose.model('Job', JobSchema);