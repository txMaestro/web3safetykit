const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const TelegramService = require('../../services/telegram.service');

// @route   POST /api/v1/telegram/generate-token
// @desc    Generate a one-time token for a logged-in user to connect their Telegram account
// @access  Private
router.post('/generate-token', auth, async (req, res) => {
  try {
    const token = await TelegramService.generateToken(req.user.id);
    const botUsername = 'web3safetykit_ai_bot'; // As provided by the user
    const connectUrl = `https://t.me/${botUsername}?start=${token}`;
    res.json({ connectUrl });
  } catch (error) {
    console.error('[TelegramRoute] Error generating token:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

// @route   POST /api/v1/telegram/connect
// @desc    Connect a user's Telegram account using a token (called by the bot)
// @access  Public (but requires a valid, secret token)
router.post('/connect', async (req, res) => {
  const { token, chatId } = req.body;

  if (!token || !chatId) {
    return res.status(400).json({ msg: 'Token and chatId are required.' });
  }

  try {
    const result = await TelegramService.connectAccount(token, chatId);
    if (!result.success) {
      return res.status(400).json({ msg: result.message });
    }
    res.json({ msg: result.message });
  } catch (error) {
    console.error('[TelegramRoute] Error connecting account:', error.message);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;