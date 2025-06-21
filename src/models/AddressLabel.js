const mongoose = require('mongoose');

const AddressLabelSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  label: {
    type: String,
    required: true,
  },
  chain: {
    type: String,
    required: true,
    lowercase: true,
  },
  source: {
    type: String,
    required: true,
    default: 'local', // e.g., 'local', 'etherscan'
  }
}, {
  // Create a compound index to ensure address is unique per chain
  timestamps: true,
  collection: 'address_labels',
  indexes: [
    {
      unique: true,
      fields: ['address', 'chain']
    }
  ]
});

module.exports = mongoose.model('AddressLabel', AddressLabelSchema);