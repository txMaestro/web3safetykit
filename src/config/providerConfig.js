require('dotenv').config();

// --- DEBUGGING: Check if the environment variable is loaded ---
console.log(`[providerConfig] BASESCAN_API_KEY loaded: ${process.env.BASESCAN_API_KEY ? 'Yes' : 'No'}`);
// --- END DEBUGGING ---

const providerConfig = {
  etherscan: {
    baseUrl: 'https://api.etherscan.io/api',
    apiKey: process.env.ETHERSCAN_API_KEY,
    rateLimitPerSecond: parseInt(process.env.ETHERSCAN_RATE_LIMIT_SECOND, 10) || 5,
    rateLimitPerMinute: parseInt(process.env.ETHERSCAN_RATE_LIMIT_MINUTE, 10) || 300,
    rateLimitPerDay: parseInt(process.env.ETHERSCAN_RATE_LIMIT_DAY, 10) || 100000,
  },
  gemini: {
    // Note: Gemini URL includes the model, so we treat it as the base
    baseUrl: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`,
    apiKey: process.env.GEMINI_API_KEY,
    rateLimitPerSecond: 1, // Gemini free tier is often around 60 per minute, so 1 per second is safe
    rateLimitPerMinute: parseInt(process.env.GEMINI_RATE_LIMIT_MINUTE, 10) || 50,
    rateLimitPerDay: parseInt(process.env.GEMINI_RATE_LIMIT_DAY, 10) || 1000,
  },
  polygonscan: {
    baseUrl: 'https://api.polygonscan.com/api',
    apiKey: process.env.POLYGONSCAN_API_KEY,
    rateLimitPerSecond: parseInt(process.env.POLYGON_RATE_LIMIT_SECOND, 10) || 5,
    rateLimitPerMinute: parseInt(process.env.POLYGON_RATE_LIMIT_MINUTE, 10) || 300,
    rateLimitPerDay: parseInt(process.env.POLYGON_RATE_LIMIT_DAY, 10) || 100000,
  },
  arbiscan: {
    baseUrl: 'https://api.arbiscan.io/api',
    apiKey: process.env.ARBITRUM_API_KEY,
    rateLimitPerSecond: parseInt(process.env.ARBITRUM_RATE_LIMIT_SECOND, 10) || 5,
    rateLimitPerMinute: parseInt(process.env.ARBITRUM_RATE_LIMIT_MINUTE, 10) || 300,
    rateLimitPerDay: parseInt(process.env.ARBITRUM_RATE_LIMIT_DAY, 10) || 100000,
  },
  basescan: {
    baseUrl: 'https://api.basescan.org/api',
    apiKey: process.env.BASESCAN_API_KEY,
    rateLimitPerSecond: parseInt(process.env.BASE_RATE_LIMIT_SECOND, 10) || 5, // Reduced from 5 to 3 to be safer
    rateLimitPerMinute: parseInt(process.env.BASE_RATE_LIMIT_MINUTE, 10) || 300, // Adjusted to match the new per-second limit
    rateLimitPerDay: parseInt(process.env.BASE_RATE_LIMIT_DAY, 10) || 100000,
  },
  zksync_explorer: {
    baseUrl: 'https://api-era.zksync.network/api',
    apiKey: process.env.ZKSYNC_API_KEY, // May not be needed for all endpoints
    rateLimitPerSecond: parseInt(process.env.ZKSYNC_RATE_LIMIT_SECOND, 10) || 5,
    rateLimitPerMinute: parseInt(process.env.ZKSYNC_RATE_LIMIT_MINUTE, 10) || 300,
    rateLimitPerDay: parseInt(process.env.ZKSYNC_RATE_LIMIT_DAY, 10) || 100000,
  }
  // Add other providers here in the same format
};

module.exports = providerConfig;