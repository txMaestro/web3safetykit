const { v4: uuidv4 } = require('uuid');
const ApiRequest = require('../models/ApiRequest');
const RequestQueueService = require('../services/RequestQueueService');
const axios = require('axios'); // We need the raw axios here for the actual call
const { default: axiosRetry } = require('axios-retry');

// This worker uses its own axios instance, separate from the one in BlockchainService
const apiClient = axios.create();
axiosRetry(apiClient, { retries: 2, retryDelay: axiosRetry.exponentialDelay });

const workerId = uuidv4();
let isProcessing = false;

const MAX_ATTEMPTS = 3;
const PROVIDER_CONFIG = require('../config/providerConfig');

async function processQueue() {
  if (isProcessing) {
    return;
  }
  isProcessing = true;

  try {
    for (const providerName in PROVIDER_CONFIG) {
      const config = PROVIDER_CONFIG[providerName];

      // 1. Check multi-level rate limits (second, minute, day)
      const now = Date.now();
      
      // 1. Check rate limits sequentially from largest to smallest window
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
      const requestsLastDay = await ApiRequest.countDocuments({ provider: providerName, status: 'completed', completedAt: { $gte: oneDayAgo } });
      if (requestsLastDay >= config.rateLimitPerDay) {
        // console.log(`[RequestProcessor] Daily rate limit reached for ${providerName}. Skipping.`);
        continue;
      }

      const oneMinuteAgo = new Date(now - 60 * 1000);
      const requestsLastMinute = await ApiRequest.countDocuments({ provider: providerName, status: 'completed', completedAt: { $gte: oneMinuteAgo } });
      if (requestsLastMinute >= config.rateLimitPerMinute) {
        // console.log(`[RequestProcessor] Minute rate limit reached for ${providerName}. Skipping.`);
        continue;
      }

      const oneSecondAgo = new Date(now - 1000);
      const requestsLastSecond = await ApiRequest.countDocuments({ provider: providerName, status: 'completed', completedAt: { $gte: oneSecondAgo } });
      if (requestsLastSecond >= config.rateLimitPerSecond) {
        // console.log(`[RequestProcessor] Second rate limit reached for ${providerName}. Skipping.`);
        continue;
      }

      // 2. Atomically find and update a pending request whose retry time has come
      const request = await ApiRequest.findOneAndUpdate(
        {
          provider: providerName,
          status: 'pending',
          $or: [
            { retryAt: null },
            { retryAt: { $lte: new Date() } }
          ]
        },
        { $set: { status: 'processing', processingId: workerId }, $inc: { attempts: 1 } },
        { sort: { createdAt: 1 }, new: true }
      );

      if (!request) {
        continue; // No pending requests for this provider
      }

      // 3. Process the request
      let result = null;
      let error = null;
      try {
        let response;
        const method = request.requestData.method || 'GET';
        const url = `${config.baseUrl}?key=${config.apiKey}`; // Gemini-style URL

        if (method === 'POST') {
          const body = request.requestData.body;
          response = await apiClient.post(url, body, {
            headers: { 'Content-Type': 'application/json' }
          });
          // Gemini response structure is different
          if (response.data.candidates && response.data.candidates.length > 0) {
            result = response.data.candidates[0].content.parts[0].text;
          } else {
             // This could be a content filter block, which is not a transient error
            throw new Error(JSON.stringify(response.data.promptFeedback) || 'AI analysis returned no candidates.');
          }
        } else { // Handle GET requests
          if (providerName === 'opensea') {
            // Handle OpenSea API requests specifically
            const { collection_address, chain } = request.requestData;
            // Using the /contract endpoint which is more direct
            const requestUrl = `${config.baseUrl}/chain/${chain}/contract/${collection_address}/stats`;
            response = await apiClient.get(requestUrl, {
              headers: { 'X-API-KEY': config.apiKey }
            });
            // OpenSea returns the data directly on success (200 OK)
            result = response.data;
          } else {
            // Default to GET for Etherscan/Bscscan
            const params = { ...request.requestData, apikey: config.apiKey };
            response = await apiClient.get(config.baseUrl, { params });
            if (response.data.status === '1' || (response.data.message && response.data.message.includes('OK'))) {
              result = response.data.result;
            } else {
              if (response.data.message === 'No transactions found') {
                result = [];
              } else {
                throw new Error(response.data.message || response.data.result || 'API request failed');
              }
            }
          }
        }
      } catch (e) {
        console.error(`[RequestProcessor] Error processing request ${request._id} (attempt ${request.attempts}). Details:`, {
          provider: request.provider,
          requestData: request.requestData,
          error: e.message,
          stack: e.stack
        });
        error = e.message;
      }

      // 4. Update the request with the outcome
      if (error && request.attempts < MAX_ATTEMPTS) {
        // Re-queue for another attempt with exponential backoff
        const delay = Math.pow(2, request.attempts) * 1000; // 2s, 4s, 8s...
        request.status = 'pending';
        request.error = `Attempt ${request.attempts} failed: ${error}`; // Log last error
        request.processingId = null;
        request.retryAt = new Date(Date.now() + delay);
        await request.save();
        // Do not resolve yet, it will be picked up again later
      } else {
        // Finalize the request (completed or permanently failed)
        request.status = error ? 'failed' : 'completed';
        request.result = result;
        request.error = error;
        request.processingId = null;
        request.completedAt = new Date();
        await request.save();

        // 5. Notify the waiting service
        RequestQueueService.resolve(request._id.toString(), { result, error });
      }
    }
  } catch (err) {
    console.error('[RequestProcessor] Critical error in processing loop:', err);
  } finally {
    isProcessing = false;
  }
}

function start() {
  console.log('[RequestProcessor] Starting API request processor worker...');
  setInterval(processQueue, 200); // Check the queue 5 times per second
}

module.exports = { start };