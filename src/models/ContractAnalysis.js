const mongoose = require('mongoose');

const AnalysisDetailSchema = new mongoose.Schema({
  isProxy: { type: Boolean, default: false },
  implementationAddress: { type: String, lowercase: true },
  sourceCodeVerified: { type: Boolean, required: true },
  risks: {
    HIGH: [String],
    MEDIUM: [String],
    LOW: [String],
  },
  honeypotIndicators: {
    hiddenApprove: Boolean,
    hardcodedAddress: Boolean,
    obfuscatedLogic: Boolean,
    unnecessarySafeMath: Boolean,
    details: [String],
  },
  aiSummary: { type: String },
  reason: { type: String }, // For unverified contracts or other notes
}, { _id: false });

const ContractAnalysisSchema = new mongoose.Schema({
  contractAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  chain: {
    type: String,
    required: true,
    index: true,
  },
  label: {
    type: String,
    default: 'Unknown',
  },
  analysis: {
    type: AnalysisDetailSchema,
    required: true,
  },
  lastAnalyzedAt: {
    type: Date,
    default: Date.now,
  },
});

// Create a compound index for faster lookups
ContractAnalysisSchema.index({ contractAddress: 1, chain: 1 });

// TTL index removed to persist all analysis data indefinitely.

module.exports = mongoose.model('ContractAnalysis', ContractAnalysisSchema);