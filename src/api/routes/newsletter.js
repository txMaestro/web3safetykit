const express = require('express');
const router = express.Router();
const NewsletterSubscription = require('../../models/NewsletterSubscription');

// @route   POST /api/v1/newsletter/subscribe
// @desc    Subscribe a user to the newsletter
// @access  Public
router.post('/subscribe', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ msg: 'Email address is required.' });
  }

  try {
    let subscription = await NewsletterSubscription.findOne({ email: email.toLowerCase() });

    if (subscription) {
      return res.status(400).json({ msg: 'This email is already subscribed.' });
    }

    subscription = new NewsletterSubscription({
      email,
    });

    await subscription.save();

    res.status(201).json({ msg: 'Successfully subscribed to the newsletter!' });

  } catch (error) {
    // Handle validation errors from the model
    if (error.name === 'ValidationError') {
      return res.status(400).json({ msg: error.message });
    }
    console.error(error.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;