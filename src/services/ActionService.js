const RevokeAction = require('../models/RevokeAction');
const User = require('../models/User');

/**
 * Service for handling user-initiated actions and analytics.
 */
class ActionService {
  /**
   * Logs a revoke action initiated by a user.
   * This is called by the frontend after the user has submitted the transaction.
   * @param {object} data - The data for the revoke action.
   * @param {string} data.walletAddress - The address of the wallet performing the action.
   * @param {string} data.chain - The chain of the action.
   * @param {string} data.tokenAddress - The address of the token contract.
   * @param {string} data.spender - The address of the spender being revoked.
   * @param {string} data.txHash - The transaction hash of the revoke action.
   * @returns {Promise<RevokeAction>} The created log entry.
   */
  static async logRevokeAction({ walletAddress, chain, tokenAddress, spender, txHash }) {
    if (!walletAddress || !chain || !tokenAddress || !spender || !txHash) {
      throw new Error('Missing required fields for logging revoke action.');
    }

    // Find the user associated with this wallet, if any
    const user = await User.findOne({ wallets: { $elemMatch: { address: walletAddress.toLowerCase() } } });

    const newAction = new RevokeAction({
      userId: user ? user._id : null,
      walletAddress,
      chain,
      tokenAddress,
      spender,
      txHash,
    });

    await newAction.save();
    console.log(`[ActionService] Logged revoke action for wallet ${walletAddress} with txHash ${txHash}`);
    return newAction;
  }
}

module.exports = ActionService;