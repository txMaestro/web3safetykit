const axios = require('axios');

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
const OPENSEA_API_URL = 'https://api.opensea.io/api/v2';

const headers = {
  'X-API-KEY': OPENSEA_API_KEY,
  'Accept': 'application/json',
};

class NftPriceService {
  /**
   * Fetches the collection stats, including floor price, for a given collection slug.
   * @param {string} collectionSlug - The OpenSea slug for the collection (e.g., 'doodles-official').
   * @returns {Promise<object|null>}
   */
  static async getCollectionStats(collectionSlug) {
    if (!OPENSEA_API_KEY) {
      console.warn('[NftPriceService] OPENSEA_API_KEY is not set. Skipping price analysis.');
      return null;
    }

    try {
      const response = await axios.get(`${OPENSEA_API_URL}/collections/${collectionSlug}/stats`, { headers });
      return response.data;
    } catch (error) {
      // It's common for a collection to not be on OpenSea or have stats
      if (error.response && error.response.status === 404) {
        console.log(`[NftPriceService] Collection ${collectionSlug} not found on OpenSea.`);
        return null;
      }
      console.error(`[NftPriceService] Error fetching stats for ${collectionSlug}:`, error.message);
      return null;
    }
  }

  /**
   * Fetches information about an NFT, including its collection slug.
   * @param {string} address - The NFT contract address.
   * @param {string} chain - The blockchain name (e.g., 'ethereum').
   * @returns {Promise<object|null>}
   */
  static async getNftCollectionInfo(address, chain) {
     if (!OPENSEA_API_KEY) {
      return null;
    }
    
    // OpenSea API uses 'ethereum', 'matic', etc. We might need a mapping if our chain names differ.
    const chainIdentifier = chain; 

    try {
      // This endpoint gets a single NFT to find its collection slug
      const response = await axios.get(`${OPENSEA_API_URL}/chain/${chainIdentifier}/contract/${address}/nfts?limit=1`, { headers });
      if (response.data.nfts && response.data.nfts.length > 0) {
        return {
          collectionSlug: response.data.nfts[0].collection,
          totalSupply: response.data.nfts[0].total_supply, // OpenSea provides this
        };
      }
      return null;
    } catch (error) {
      console.error(`[NftPriceService] Error fetching NFT info for ${address}:`, error.message);
      return null;
    }
  }
}

module.exports = NftPriceService;