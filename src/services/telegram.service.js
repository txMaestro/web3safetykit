const crypto = require('crypto');
const TelegramToken = require('../models/TelegramToken');
const User = require('../models/User');

class TelegramService {
  /**
   * Generates a secure, unique token for a user and saves it to the database.
   * @param {string} userId - The ID of the user to generate a token for.
   * @returns {Promise<string>} The generated token.
   */
  static async generateToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    await TelegramToken.create({ userId, token });
    return token;
  }

  /**
   * Verifies a token, connects the user's Telegram chat ID, and deletes the token.
   * @param {string} token - The token from the bot.
   * @param {string} chatId - The user's Telegram chat ID.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  static async connectAccount(token, chatId) {
    const storedToken = await TelegramToken.findOne({ token });

    if (!storedToken) {
      return { success: false, message: 'Invalid or expired token. Please try again.' };
    }

    const user = await User.findById(storedToken.userId);
    if (!user) {
      return { success: false, message: 'User not found.' };
    }

    user.telegramChatId = chatId;
    await user.save();

    // The token has been used, so we delete it.
    await storedToken.deleteOne();

    return { success: true, message: 'Account connected successfully!' };
  }
}

module.exports = TelegramService;