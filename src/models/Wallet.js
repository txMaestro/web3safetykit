const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  address: {
    type: String,
    required: true,
  },
  chain: {
    type: String,
    required: true,
    enum: ['ethereum', 'polygon', 'arbitrum', 'base', 'zksync'], // Example chains
  },
  label: {
    type: String,
    required: false,
  },
  lastScanAt: {
    type: Date,
  },
  transactionCache: {
    txlist: { type: Array, default: [] },
    tokentx: { type: Array, default: [] },
    tokennfttx: { type: Array, default: [] },
    lastBlock: {
      txlist: { type: Number, default: 0 },
      tokentx: { type: Number, default: 0 },
      tokennfttx: { type: Number, default: 0 },
    },
    updatedAt: { type: Date },
  },
  lastAnalysisState: {
    // To store the state of the last analysis for comparison
    approvals: { type: Array, default: [] }, // Store hashes or IDs of approvals
    interactedContracts: { type: Array, default: [] }, // Store addresses of interacted contracts
    lastUpdatedAt: { type: Date }
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index to ensure a user doesn't add the same wallet address on the same chain twice
WalletSchema.index({ userId: 1, address: 1, chain: 1 }, { unique: true });

module.exports = mongoose.model('Wallet', WalletSchema);