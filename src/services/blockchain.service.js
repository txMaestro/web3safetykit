const { ethers } = require('ethers');
const RequestQueueService = require('./RequestQueueService');

const providers = {
  ethereum: new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL || `https://mainnet.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`),
  polygon: new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY_POLYGON}`),
  arbitrum: new ethers.JsonRpcProvider(process.env.ARBITRUM_RPC_URL || `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY_ARBITRUM}`),
  base: new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || `https://mainnet.base.org`),
  zksync: new ethers.JsonRpcProvider(process.env.ZKSYNC_RPC_URL || 'https://mainnet.era.zksync.io'),
};

const explorerApiUrls = {
  ethereum: 'https://api.etherscan.io/api',
  bsc: 'https://api.bscscan.com/api',
};

const explorerApiKeys = {
  ethereum: process.env.ETHERSCAN_API_KEY,
  bsc: process.env.BSCSCAN_API_KEY,
};

class BlockchainService {
  /**
   * Gets the ethers provider for a given chain.
   * @param {string} chain - The name of the blockchain (e.g., 'ethereum').
   * @returns {ethers.Provider}
   */
  static getProvider(chain) {
    const provider = providers[chain];
    if (!provider) {
      throw new Error(`Provider for chain '${chain}' not configured.`);
    }
    return provider;
  }

  /**
   * A helper to map chain name to provider name for the queue.
   * @param {string} chain
   * @returns {string}
   */
  static getProviderName(chain) {
    if (chain === 'ethereum') return 'etherscan';
    if (chain === 'polygon') return 'polygonscan';
    if (chain === 'arbitrum') return 'arbiscan';
    if (chain === 'base') return 'basescan';
    if (chain === 'zksync') return 'zksync_explorer';
    throw new Error(`Provider name for chain '${chain}' not configured.`);
  }

  /**
   * Fetches the approval events for a given wallet address.
   * @param {string} address - The wallet address.
   * @param {string} chain - The blockchain name.
   * @param {object} [options={}] - Additional options like startblock.
   * @returns {Promise<any>}
   */
  static async getApprovalEvents(address, chain, options = {}) {
    const providerName = this.getProviderName(chain);
    const requestData = {
      module: 'account',
      action: 'tokenapproval',
      address: address,
      ...options,
    };
    return RequestQueueService.add(providerName, requestData);
  }

  /**
   * Gets the allowance of a token for a spender.
   * @param {string} tokenAddress - The ERC20 token contract address.
   * @param {string} ownerAddress - The address of the token owner.
   * @param {string} spenderAddress - The address of the spender.
   * @param {string} chain - The blockchain name.
   * @returns {Promise<bigint>}
   */
  static async getAllowance(tokenAddress, ownerAddress, spenderAddress, chain) {
    const provider = this.getProvider(chain);
    const abi = ["function allowance(address owner, address spender) view returns (uint256)"];
    const contract = new ethers.Contract(tokenAddress, abi, provider);
    try {
      return await contract.allowance(ownerAddress, spenderAddress);
    } catch (error) {
      // It might fail if the contract is not a valid ERC20, etc.
      console.warn(`[BlockchainService] Could not get allowance for token ${tokenAddress}. Error: ${error.message}`);
      return BigInt(0);
    }
  }
  /**
   * Fetches the list of normal transactions for a given address.
   * @param {string} address - The wallet address.
   * @param {string} chain - The blockchain name.
   * @param {object} [options={}] - Additional options like startblock.
   * @returns {Promise<any>}
   */
  static async getTransactions(address, chain, options = {}) {
    const providerName = this.getProviderName(chain);
    const requestData = {
      module: 'account',
      action: 'txlist',
      address: address,
      sort: 'asc', // Default sort, can be overridden by options
      ...options,
    };
    return RequestQueueService.add(providerName, requestData);
  }

  /**
   * Fetches the source code of a contract.
   * @param {string} address - The contract address.
   * @param {string} chain - The blockchain name.
   * @param {object} [options={}] - Additional options.
   * @returns {Promise<any>}
   */
  static async getSourceCode(address, chain, options = {}) {
    const providerName = this.getProviderName(chain);
    const requestData = {
      module: 'contract',
      action: 'getsourcecode',
      address: address,
      ...options,
    };
    return RequestQueueService.add(providerName, requestData);
  }

  /**
   * Checks if an address is a smart contract.
   * @param {string} address - The address to check.
   * @param {string} chain - The blockchain name.
   * @returns {Promise<boolean>}
   */
  static async isContract(address, chain) {
    const provider = this.getProvider(chain);
    try {
      const code = await provider.getCode(address);
      // If the code is not '0x', it's a contract
      return code !== '0x';
    } catch (error) {
      console.error(`[BlockchainService] Error checking if address ${address} is a contract:`, error.message);
      return false; // Assume not a contract on error
    }
  }

  /**
   * Gets the runtime bytecode for a given address.
   * @param {string} address - The address to get the code for.
   * @param {string} chain - The blockchain name.
   * @returns {Promise<string|null>} The bytecode as a hex string, or null on error.
   */
  static async getCode(address, chain) {
    const provider = this.getProvider(chain);
    try {
      return await provider.getCode(address);
    } catch (error) {
      console.error(`[BlockchainService] Error getting code for address ${address}:`, error.message);
      return null;
    }
  }

  /**
   * Fetches the list of NFT transfer events for a given address.
   * @param {string} address - The wallet address.
   * @param {string} chain - The blockchain name.
   * @param {object} [options={}] - Additional options like startblock.
   * @returns {Promise<any>}
   */
  static async getNftTransfers(address, chain, options = {}) {
    const providerName = this.getProviderName(chain);
    const requestData = {
      module: 'account',
      action: 'tokennfttx',
      address: address,
      sort: 'asc',
      ...options,
    };
    return RequestQueueService.add(providerName, requestData);
  }

  /**
   * Checks if an operator is approved for all of an owner's assets.
   * @param {string} contractAddress - The NFT contract address.
   * @param {string} ownerAddress - The address of the asset owner.
   * @param {string} operatorAddress - The address of the operator.
   * @param {string} chain - The blockchain name.
   * @returns {Promise<boolean>}
   */
  static async isApprovedForAll(contractAddress, ownerAddress, operatorAddress, chain) {
    const provider = this.getProvider(chain);
    const abi = ["function isApprovedForAll(address owner, address operator) view returns (bool)"];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    try {
      return await contract.isApprovedForAll(ownerAddress, operatorAddress);
    } catch (error) {
      console.warn(`[BlockchainService] Could not check isApprovedForAll for contract ${contractAddress}. Error: ${error.message}`);
      return false;
    }
  }

  /**
   * Fetches the list of ERC20 token transfer events for a given address.
   * @param {string} address - The wallet address.
   * @param {string} chain - The blockchain name.
   * @param {object} [options={}] - Additional options like startblock.
   * @returns {Promise<any>}
   */
  static async getTokenTransfers(address, chain, options = {}) {
    const providerName = this.getProviderName(chain);
    const requestData = {
      module: 'account',
      action: 'tokentx',
      address: address,
      sort: 'asc',
      ...options,
    };
    return RequestQueueService.add(providerName, requestData);
  }

  /**
   * Gets the address of the LP pair for two tokens from a DEX factory.
   * @param {string} factoryAddress - The address of the DEX factory contract.
   * @param {string} tokenA - The address of the first token.
   * @param {string} tokenB - The address of the second token.
   * @param {string} chain - The blockchain name.
   * @returns {Promise<string|null>}
   */
  static async getPair(factoryAddress, tokenA, tokenB, chain) {
    const provider = this.getProvider(chain);
    const abi = ["function getPair(address tokenA, address tokenB) view returns (address pair)"];
    const contract = new ethers.Contract(factoryAddress, abi, provider);
    try {
      const pairAddress = await contract.getPair(tokenA, tokenB);
      // If the pair doesn't exist, it returns the zero address
      return pairAddress === ethers.ZeroAddress ? null : pairAddress;
    } catch (error) {
      // This can fail if the factory doesn't have this pair, which is normal.
      return null;
    }
  }

  /**
   * Gets the ERC20 token balance of an address.
   * @param {string} contractAddress - The token contract address.
   * @param {string} ownerAddress - The address of the owner.
   * @param {string} chain - The blockchain name.
   * @returns {Promise<bigint>}
   */
  static async getBalance(contractAddress, ownerAddress, chain) {
    const provider = this.getProvider(chain);
    const abi = ["function balanceOf(address owner) view returns (uint256)"];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    try {
      return await contract.balanceOf(ownerAddress);
    } catch (error) {
      console.warn(`[BlockchainService] Could not get balance for token ${contractAddress}. Error: ${error.message}`);
      return BigInt(0);
    }
  }

  /**
   * Parses transaction input data using a given ABI interface.
   * @param {string} txInput - The transaction's input data (hex string).
   * @param {ethers.Interface} iface - The ethers Interface object for the ABI.
   * @returns {ethers.TransactionDescription | null}
   */
  static parseTransactionInput(txInput, iface) {
    try {
      // The input data for a function call is the function selector (4 bytes) followed by the encoded arguments.
      // A transaction with no input data or just a value transfer will have '0x'.
      if (txInput.length < 10) {
        return null;
      }
      return iface.parseTransaction({ data: txInput });
    } catch (error) {
      // This error is expected if the transaction input does not match the interface
      return null;
    }
  }

  /**
   * Gets the implementation address for a proxy contract following EIP-1967.
   * @param {string} proxyAddress - The address of the proxy contract.
   * @param {string} chain - The blockchain name.
   * @returns {Promise<string|null>} The implementation address or null if not found.
   */
  static async getImplementationAddress(proxyAddress, chain) {
    const provider = this.getProvider(chain);
    // EIP-1967 storage slot for implementation address
    const implementationSlot = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
    try {
      const storageValue = await provider.getStorage(proxyAddress, implementationSlot);
      if (storageValue && storageValue !== '0x' + '0'.repeat(64)) {
        // The address is the last 20 bytes (40 hex characters) of the storage value
        const address = '0x' + storageValue.slice(-40);
        return ethers.getAddress(address); // Return checksummed address
      }
      return null;
    } catch (error) {
      console.warn(`[BlockchainService] Could not check for implementation address for ${proxyAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Tries to read the 'name()' function from a contract.
   * @param {string} contractAddress - The address of the contract.
   * @param {string} chain - The blockchain name.
   * @returns {Promise<string|null>} The contract name or null if not available.
   */
  static async getContractName(contractAddress, chain) {
    const provider = this.getProvider(chain);
    const abi = ["function name() view returns (string)"];
    const contract = new ethers.Contract(contractAddress, abi, provider);
    try {
      // Add a timeout to prevent long hangs on non-responsive nodes/contracts
      const name = await Promise.race([
        contract.name(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      return name;
    } catch (error) {
      // Expected to fail for contracts without a name() function, or if it's not a contract.
      return null;
    }
  }
}

module.exports = BlockchainService;