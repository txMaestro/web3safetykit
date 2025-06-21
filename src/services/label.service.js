const axios = require('axios');
const AddressLabel = require('../models/AddressLabel');
const providerConfig = require('../config/providerConfig');
const BlockchainService = require('./blockchain.service');

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
      const proxyResolutionPromises = [];

      results.forEach((result, index) => {
        const address = remainingAddresses[index];
        if (result.status === 'fulfilled' && result.value.data && result.value.data.status === '1') {
          const contractName = result.value.data.result[0].ContractName;
          if (contractName && contractName.trim() !== '' && contractName !== 'vyper_contract') {
            let label = contractName.trim();
            
            // Check if the contract is a known proxy type
            if (label.toLowerCase().includes('proxy')) {
              // If it's a proxy, create a promise to resolve the implementation
              const resolutionPromise = this.resolveProxy(address, chain, provider)
                .then(implementationLabel => {
                  if (implementationLabel) {
                    label = implementationLabel; // Use the more specific implementation label
                  }
                })
                .finally(() => {
                  // Save the final label (either proxy or implementation)
                  labels.set(address, label);
                  labelCache.set(`${address}-${chain}`, label);
                  newLabelsToSave.push({ address, chain, label, source: chain });
                });
              proxyResolutionPromises.push(resolutionPromise);
            } else {
              // Not a proxy, save label directly
              labels.set(address, label);
              labelCache.set(`${address}-${chain}`, label);
              newLabelsToSave.push({ address, chain, label, source: chain });
            }
          }
        }
      });

      // Wait for all proxy resolutions to complete before proceeding
      await Promise.allSettled(proxyResolutionPromises);

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

  /**
   * Tries to find the implementation contract for a proxy and get its name.
   * @param {string} proxyAddress - The address of the proxy contract.
   * @param {string} chain - The blockchain name.
   * @param {object} provider - The block explorer provider config from providerConfig.
   * @returns {Promise<string|null>} The implementation contract name or null.
   */
  static async resolveProxy(proxyAddress, chain, provider) {
    try {
      const implementationAddress = await BlockchainService.getImplementationAddress(proxyAddress, chain);
      if (!implementationAddress) {
        return null;
      }

      // Now, fetch the source code for the implementation address
      const url = `${provider.baseUrl}?module=contract&action=getsourcecode&address=${implementationAddress}&apikey=${provider.apiKey}`;
      const response = await axios.get(url, { timeout: 5000 });

      if (response.data && response.data.status === '1') {
        const contractName = response.data.result[0].ContractName;
        if (contractName && contractName.trim() !== '' && contractName !== 'vyper_contract') {
          return contractName.trim();
        }
      }
      return null;
    } catch (error) {
      console.warn(`[LabelService] Could not resolve proxy for ${proxyAddress} on ${chain}:`, error.message);
      return null;
    }
  }
}

module.exports = LabelService;