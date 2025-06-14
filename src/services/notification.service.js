const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let bot;
if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);
  // bot.launch(); // We don't need to launch the bot for just sending messages
} else {
  console.warn('[NotificationService] TELEGRAM_BOT_TOKEN is not set. Telegram notifications are disabled.');
}

class NotificationService {
  /**
   * Sends a message to a Telegram chat.
   * @param {string} chatId - The user's Telegram chat ID.
   * @param {string} message - The message to send.
   * @returns {Promise<void>}
   */
  static async sendTelegramMessage(chatId, message) {
    if (!bot || !chatId) {
      return;
    }

    try {
      await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      console.log(`[NotificationService] Sent notification to chat ID ${chatId}`);
    } catch (error) {
      console.error(`[NotificationService] Failed to send Telegram message to ${chatId}:`, error.message);
    }
  }
}

module.exports = NotificationService;