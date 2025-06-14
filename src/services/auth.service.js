const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const crypto =random = require('crypto');
const User = require('../models/User');

class AuthService {
  /**
   * Generates a secure, one-time nonce for a user to sign.
   * @param {string} walletAddress - The user's wallet address.
   * @returns {Promise<string>} - The message to be signed by the user.
   */
  static async generateNonce(walletAddress) {
    const nonce = `web3safetykit-login-${crypto.randomBytes(16).toString('hex')}-${Date.now()}`;
    
    const user = await User.findOneAndUpdate(
      { walletAddress: walletAddress.toLowerCase() },
      { $set: { authNonce: nonce } },
      { upsert: true, new: true }
    );

    return `Please sign this message to log in: ${nonce}`;
  }

  /**
   * Verifies a signed message, logs in the user, and returns a JWT.
   * @param {string} walletAddress - The user's wallet address.
   * @param {string} signature - The signature provided by the user.
   * @returns {Promise<{token: string, user: object}>} - The JWT and user object.
   */
  static async verifySignature(walletAddress, signature) {
    const lowerCaseAddress = walletAddress.toLowerCase();
    const user = await User.findOne({ walletAddress: lowerCaseAddress });

    if (!user || !user.authNonce) {
      throw new Error('Invalid request. Please try signing in again.');
    }

    const message = `Please sign this message to log in: ${user.authNonce}`;
    
    const recoveredAddress = ethers.verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== lowerCaseAddress) {
      throw new Error('Signature verification failed.');
    }

    // Clear the nonce after successful verification for security
    user.authNonce = undefined;
    await user.save();

    const payload = {
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
      },
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '7d', // 7 days token validity
    });

    return { token, user: { id: user.id, walletAddress: user.walletAddress, email: user.email } };
  }
}

module.exports = AuthService;