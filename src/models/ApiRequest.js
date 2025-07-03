const mongoose = require('mongoose');

const apiRequestSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    index: true,
    enum: [
      'etherscan_v2', // Unified provider for all Etherscan-like explorers
      'gemini',
      // 'zksync_explorer' is now also handled by etherscan_v2
    ],
  },
  requestData: {
    type: Object,
    required: true,
    // Example: { module: 'account', action: 'txlist', address: '0x...' }
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
  },
  error: {
    type: String,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  processingId: { // To ensure only one worker processes this request
    type: String,
    default: null,
    index: true,
  },
  completedAt: {
    type: Date,
  },
  retryAt: {
    type: Date,
    default: null,
    index: true,
  }
}, { timestamps: true }); // Adds createdAt and updatedAt

const ApiRequest = mongoose.model('ApiRequest', apiRequestSchema);

module.exports = ApiRequest;