const axios = require('axios');
const AddressLabel = require('../models/AddressLabel');
const providerConfig = require('../config/providerConfig');

// A simple in-memory cache to avoid hitting the DB/API for the same address multiple times in a single run
const labelCache = new Map();

class LabelService {

  /**
   * Fetches labels for a given list of addresses for a specific chain.
   * It first checks the local DB, then falls back to an external API (Etherscan).
   * Results from the API are cached in the local DB for future use.
   * @param {string[]} addresses - An array of addresses to fetch labels for.
   * @param {string} chain - The blockchain to check against (e.g., 'ethereum').
   * @returns {Promise<Map<string, string>>} - A map of addresses to their labels.
   */
  static async getLabels(addresses, chain) {
    const lowercasedAddresses = [...new Set(addresses.map(a => a.toLowerCase()))];
    const labels = new Map();

    // 1. Check in-memory cache first
    const uncachedAddresses = [];
    for (const address of lowercasedAddresses) {
      const cacheKey = `${address}-${chain}`;
      if (labelCache.has(cacheKey)) {
        labels.set(address, labelCache.get(cacheKey));
      } else {
        uncachedAddresses.push(address);
      }
    }

    if (uncachedAddresses.length === 0) {
      return labels;
    }

    // 2. Check local database for the remaining addresses
    const dbLabels = await AddressLabel.find({ address: { $in: uncachedAddresses }, chain });
    dbLabels.forEach(label => {
      labels.set(label.address, label.label);
      labelCache.set(`${label.address}-${chain}`, label.label);
    });

    // 3. For any addresses still without a label, try fetching from a block explorer API
    const remainingAddresses = uncachedAddresses.filter(a => !labels.has(a));

    const chainToProviderMap = {
      ethereum: 'etherscan',
      polygon: 'polygonscan',
      arbitrum: 'arbiscan',
      base: 'basescan',
      zksync: 'zksync_explorer'
    };

    const providerKey = chainToProviderMap[chain];
    const provider = providerConfig[providerKey];

    if (remainingAddresses.length > 0 && provider && provider.apiKey && provider.baseUrl) {
      const promises = remainingAddresses.map(address => {
        const url = `${provider.baseUrl}?module=contract&action=getsourcecode&address=${address}&apikey=${provider.apiKey}`;
        return axios.get(url, { timeout: 5000 });
      });

      const results = await Promise.allSettled(promises);
      const newLabelsToSave = [];

      results.forEach((result, index) => {
        const address = remainingAddresses[index];
        if (result.status === 'fulfilled' && result.value.data && result.value.data.status === '1') {
          const contractName = result.value.data.result[0].ContractName;
          if (contractName && contractName !== 'vyper_contract') {
            const label = contractName.trim();
            labels.set(address, label);
            labelCache.set(`${address}-${chain}`, label);
            newLabelsToSave.push({
              address,
              chain,
              label,
              source: chain, 
            });
          }
        }
      });

      // Batch insert new labels into the database, but don't wait for it to finish
      if (newLabelsToSave.length > 0) {
        AddressLabel.insertMany(newLabelsToSave, { ordered: false })
          .catch(err => {
            // Ignore duplicate key errors, log others
            if (err.code !== 11000) {
              console.error('[LabelService] Error saving new labels to DB:', err);
            }
          });
      }
    }

    return labels;
  }
}

module.exports = LabelService;