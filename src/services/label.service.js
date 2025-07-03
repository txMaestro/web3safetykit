const axios = require('axios');
const AddressLabel = require('../models/AddressLabel');
const { providerConfig, CHAIN_ID_MAP } = require('../config/providerConfig');
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

    // 3. For any addresses still without a label, try reading the name directly from the contract
    let remainingAddresses = uncachedAddresses.filter(a => !labels.has(a));
    if (remainingAddresses.length > 0) {
      const onChainNamePromises = remainingAddresses.map(address => BlockchainService.getContractName(address, chain));
      const onChainNames = await Promise.allSettled(onChainNamePromises);

      const newLabelsToSave = [];
      onChainNames.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          const address = remainingAddresses[index];
          const label = result.value;
          labels.set(address, label);
          labelCache.set(`${address}-${chain}`, label);
          newLabelsToSave.push({ address, chain, label, source: 'on-chain' });
        }
      });

      if (newLabelsToSave.length > 0) {
        AddressLabel.insertMany(newLabelsToSave, { ordered: false })
          .catch(err => {
            if (err.code !== 11000) console.error('[LabelService] Error saving on-chain labels to DB:', err);
          });
      }
    }

    // 4. For any addresses STILL without a label, try fetching from a block explorer API
    remainingAddresses = uncachedAddresses.filter(a => !labels.has(a));

    // With Etherscan V2, all supported chains use the same provider config.
    const providerKey = 'etherscan_v2';
    const provider = providerConfig[providerKey];
    const chainId = CHAIN_ID_MAP[chain];

    if (remainingAddresses.length > 0 && provider && provider.apiKey && provider.baseUrl && chainId) {
      const promises = remainingAddresses.map(address => {
        // Construct the URL for Etherscan V2, including the chainid
        const url = `${provider.baseUrl}?module=contract&action=getsourcecode&address=${address}&chainid=${chainId}&apikey=${provider.apiKey}`;
        return axios.get(url, { timeout: 5000 });
      });

      const results = await Promise.allSettled(promises);
      const newLabelsToSave = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const address = remainingAddresses[i];

        if (result.status === 'fulfilled' && result.value.data && result.value.data.status === '1') {
          const initialName = result.value.data.result[0].ContractName;

          if (initialName && initialName.trim() !== '' && initialName !== 'vyper_contract') {
            let finalLabel = initialName.trim();

            // If it's a proxy, try to resolve the implementation name
            if (finalLabel.toLowerCase().includes('proxy')) {
              const implementationLabel = await this.resolveProxy(address, chain, provider);
              // Only use the implementation label if it's valid and different
              if (implementationLabel && implementationLabel.toLowerCase() !== finalLabel.toLowerCase()) {
                finalLabel = implementationLabel;
              } else {
                // If we can't find a better name, don't label it at all.
                continue;
              }
            }

            // Save the meaningful label
            labels.set(address, finalLabel);
            labelCache.set(`${address}-${chain}`, finalLabel);
            newLabelsToSave.push({ address, chain, label: finalLabel, source: chain });
          }
        }
      }

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
      const chainId = CHAIN_ID_MAP[chain];
      if (!chainId) return null; // Cannot resolve if chainId is unknown

      // Now, fetch the source code for the implementation address using V2 format
      const url = `${provider.baseUrl}?module=contract&action=getsourcecode&address=${implementationAddress}&chainid=${chainId}&apikey=${provider.apiKey}`;
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