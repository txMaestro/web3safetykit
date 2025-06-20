const mongoose = require('mongoose');

/**
 * Schema to log user-initiated revoke actions for analytics.
 */
const RevokeActionSchema = new mongoose.Schema({
  // The user who initiated the action, if logged in
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  // The wallet address that performed the revoke
  walletAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  // The chain on which the action occurred
  chain: {
    type: String,
    required: true,
    trim: true,
  },
  // The address of the token/NFT contract
  tokenAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  // The address of the spender/operator being revoked
  spender: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  // The transaction hash of the on-chain revoke transaction
  txHash: {
    type: String,
    required: true,
    unique: true, // Each revoke tx should only be logged once
    trim: true,
  },
  // The status of the transaction, to be updated by a separate process if needed
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending',
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
});

const RevokeAction = mongoose.model('RevokeAction', RevokeActionSchema);

module.exports = RevokeAction;