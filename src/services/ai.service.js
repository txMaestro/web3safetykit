const RequestQueueService = require('./RequestQueueService');

class AiService {
  /**
   * Analyzes a smart contract's source code using the centralized queue for Gemini API.
   * @param {string} sourceCode - The source code of the smart contract.
   * @returns {Promise<string|null>} - A human-readable summary of the contract's function and potential risks.
   */
  static async analyzeContract(sourceCode) {
    if (!process.env.GEMINI_API_KEY) {
      console.warn('[AiService] GEMINI_API_KEY is not set. Skipping AI analysis.');
      return "AI analysis is not configured.";
    }

    // Prepare a concise version of the code if it's too long
    const truncatedCode = sourceCode.length > 30000 ? sourceCode.substring(0, 30000) : sourceCode;

    const prompt = `
      You are a senior smart contract security auditor.
      Analyze the following Solidity source code.
      Provide a brief, easy-to-understand summary (max 2-3 sentences) of what this contract does.
      Then, list any potential security risks or red flags in bullet points.
      Focus on common vulnerabilities like reentrancy, integer overflow/underflow, access control issues, and any malicious-looking logic.
      If there are no obvious risks, state that.

      Here is the code:
      ---
      ${truncatedCode}
      ---
    `;

    const requestData = {
      method: 'POST',
      body: {
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      }
    };

    try {
      // Use the centralized queue service
      const result = await RequestQueueService.add('gemini', requestData);
      return result || "AI analysis could not generate a response.";
    } catch (error) {
      console.error('[AiService] Error queuing Gemini API request:', error.message);
      return `AI analysis failed: ${error.message}`;
    }
  }
}

module.exports = AiService;