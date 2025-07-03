require('dotenv').config();

/**
 * A map from our internal chain names to the official chain IDs used by Etherscan V2.
 * Source: https://docs.etherscan.io/api-endpoints/etherscan-api-endpoints
 */
const CHAIN_ID_MAP = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  base: 8453,
  zksync: 324,
  // Add other supported chain IDs here as needed
};

const providerConfig = {
  /**
   * Etherscan V2 unified configuration.
   * This single configuration supports all Etherscan-like explorers via the 'chainid' parameter.
   */
  etherscan_v2: {
    baseUrl: 'https://api.etherscan.io/v2/api',
    apiKey: process.env.ETHERSCAN_API_KEY,
    // A single, safer rate limit for the unified endpoint. 5 is the official limit.
    rateLimitPerSecond: parseInt(process.env.ETHERSCAN_RATE_LIMIT_SECOND, 10) || 4,
    rateLimitPerMinute: parseInt(process.env.ETHERSCAN_RATE_LIMIT_MINUTE, 10) || 240,
    rateLimitPerDay: parseInt(process.env.ETHERSCAN_RATE_LIMIT_DAY, 10) || 100000,
  },

  /**
   * Configuration for Gemini API.
   */
  gemini: {
    baseUrl: `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`,
    apiKey: process.env.GEMINI_API_KEY,
    rateLimitPerSecond: 1,
    rateLimitPerMinute: parseInt(process.env.GEMINI_RATE_LIMIT_MINUTE, 10) || 50,
    rateLimitPerDay: parseInt(process.env.GEMINI_RATE_LIMIT_DAY, 10) || 1000,
  },
};

module.exports = {
  providerConfig,
  CHAIN_ID_MAP,
};