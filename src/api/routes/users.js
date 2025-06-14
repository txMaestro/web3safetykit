const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const User = require('../../models/User');

// @route   GET api/v1/user/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', auth, async (req, res) => {
  try {
    // req.user is set by the auth middleware
    const user = await User.findById(req.user.id).select('-authNonce'); // Exclude nonce from profile data
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


// @route   PUT api/v1/user/profile
// @desc    Update user's profile (e.g., email, telegramChatId)
// @access  Private
router.put('/profile', auth, async (req, res) => {
  const { email, telegramChatId } = req.body;

  const profileFields = {};
  if (email) profileFields.email = email;
  if (telegramChatId) profileFields.telegramChatId = telegramChatId;

  try {
    let user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: profileFields },
      { new: true }
    ).select('-authNonce');

    res.json(user);
  } catch (err) {
    console.error(err.message);
    // Handle potential duplicate email error
    if (err.code === 11000) {
        return res.status(400).json({ msg: 'Email is already in use.' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;