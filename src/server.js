require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');

const { startMasterScheduler } = require('./scheduler/master.scheduler');

const app = express();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

// API Routes
app.use('/api/v1/user', require('./api/routes/users')); // Re-enabled for profile management
app.use('/api/v1/auth', require('./api/routes/auth'));
app.use('/api/v1/scan', require('./api/routes/scan'));
app.use('/api/v1/newsletter', require('./api/routes/newsletter'));
app.use('/api/wallets', require('./api/routes/wallets')); // This might need updates to use the new user model
app.use('/api/queue', require('./api/routes/queue'));
app.use('/api/v1/actions', require('./api/routes/actions'));

// --- WORKER INITIALIZATION ---
// The require calls below initialize the workers and their listeners.
require('./workers/fullScan.worker');
require('./workers/TransactionFetcher.worker');
require('./workers/contract.worker');
require('./workers/activity.worker');
// require('./workers/nft.worker'); // Disabled
require('./workers/lpStake.worker');
require('./workers/approval.worker');

// --- SERVICE & SCHEDULER INITIALIZATION ---
const startServer = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Start the background workers and schedulers
    const requestProcessor = require('./workers/RequestProcessor.worker');
    requestProcessor.start();
    startMasterScheduler(); // Start the periodic scan scheduler

    // 3. Start the Express server
    const PORT = process.env.API_PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Failed to start the server:", error);
    process.exit(1);
  }
};

app.get('/', (req, res) => {
  res.send('Web3 Safety Kit Backend is running!');
});

startServer();