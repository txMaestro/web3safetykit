const { Telegraf } = require('telegraf');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

let bot;
if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);

  // --- Bot Onboarding and Commands ---

  // Welcome message on /start
  bot.start((ctx) => {
    const welcomeMessage = `
👋 *Welcome to the Web3 Safety Kit Bot!*

I'm here to send you real-time alerts about risky approvals and suspicious contracts you've interacted with.

To get started, you need to:
1.  **Sign up** on our website.
2.  **Add your wallet address** to your profile.
3.  **Connect your Telegram account** in your user settings to link it with your wallet.

Once connected, I'll start monitoring your on-chain activity and keep you safe!
    `;
    ctx.replyWithMarkdown(welcomeMessage);
  });

  // Help message on /help
  bot.help((ctx) => {
    const helpMessage = `
*Web3 Safety Kit Bot Commands*

- \`/start\`: Shows the welcome message and instructions.
- \`/help\`: Displays this help message.

My main job is to automatically send you security alerts. There are no other commands to run. Just make sure your wallet is connected on the website!
    `;
    ctx.replyWithMarkdown(helpMessage);
  });

  // Launch the bot to start listening for commands
  bot.launch();
  console.log('[NotificationService] Telegram bot launched and listening for commands.');

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