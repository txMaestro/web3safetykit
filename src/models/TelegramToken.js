const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TelegramTokenSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '10m', // The token will automatically be deleted after 10 minutes
  },
});

module.exports = mongoose.model('TelegramToken', TelegramTokenSchema);