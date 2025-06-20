const mongoose = require('mongoose');

/**
 * Schema to cache the results of guest scans to prevent abuse and reduce API costs.
 */
const GuestScanCacheSchema = new mongoose.Schema({
  // The wallet address that was scanned
  walletAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true, // Each wallet has only one cache entry
    index: true,
  },
  // The full, formatted result of the last successful scan
  lastScanResult: {
    type: Object,
    required: true,
  },
  // The timestamp of when the last successful scan was completed
  lastScannedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt
});

// Create a TTL index to automatically delete old cache entries after a certain period (e.g., 30 days)
// This is just for housekeeping and is separate from the 12-hour check logic.
GuestScanCacheSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

const GuestScanCache = mongoose.model('GuestScanCache', GuestScanCacheSchema);

module.exports = GuestScanCache;