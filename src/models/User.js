const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true, // Index for faster queries
  },
  email: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values for the email field
    required: false,
  },
  authNonce: {
    type: String,
    required: false,
  },
  telegramChatId: {
    type: String,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', UserSchema);