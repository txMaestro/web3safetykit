const EventEmitter = require('events');
const ApiRequest = require('../models/ApiRequest');

class RequestQueueService {
  constructor() {
    this.eventEmitter = new EventEmitter();
    // Increase the listener limit as we might have many concurrent requests
    this.eventEmitter.setMaxListeners(100); 
  }

  /**
   * Adds a request to the MongoDB queue and waits for it to be processed.
   * @param {string} provider - The API provider (e.g., 'etherscan').
   * @param {object} requestData - The parameters for the API request.
   * @returns {Promise<any>} - A promise that resolves with the result of the API call.
   */
  add(provider, requestData) {
    return new Promise(async (resolve, reject) => {
      try {
        // Create a new request document in the database
        const request = await ApiRequest.create({
          provider,
          requestData,
          status: 'pending',
        });

        const requestId = request._id.toString();

        // Set a timeout for the request
        const timeoutSeconds = parseInt(process.env.REQUEST_TIMEOUT_SECONDS, 10) || 120; // Default to 120 seconds
        const timeout = setTimeout(() => {
          this.eventEmitter.removeAllListeners(requestId);
          reject(new Error(`Request ${requestId} timed out after ${timeoutSeconds} seconds.`));
        }, timeoutSeconds * 1000);

        // Listen for the completion event
        this.eventEmitter.once(requestId, (jobResult) => {
          clearTimeout(timeout);
          if (jobResult.error) {
            reject(new Error(jobResult.error));
          } else {
            resolve(jobResult.result);
          }
        });

      } catch (error) {
        console.error('[RequestQueueService] Error adding request to queue:', error);
        reject(error);
      }
    });
  }

  /**
   * Resolves a pending request by emitting its completion event.
   * This is called by the RequestProcessor worker.
   * @param {string} requestId - The ID of the completed request.
   * @param {object} jobResult - An object containing either the result or an error.
   * @param {any} [jobResult.result] - The successful result of the job.
   * @param {string} [jobResult.error] - The error message if the job failed.
   */
  resolve(requestId, jobResult) {
    this.eventEmitter.emit(requestId, jobResult);
  }
}

// Export a singleton instance
module.exports = new RequestQueueService();