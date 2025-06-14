const express = require('express');
const router = express.Router();
const ApiRequest = require('../../models/ApiRequest');

/**
 * @route   GET /api/queue/status
 * @desc    Get the current status of the API request queue
 * @access  Public (or protected if you add auth middleware)
 */
router.get('/status', async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60000);

    const stats = await ApiRequest.aggregate([
      {
        $facet: {
          "counts": [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 }
              }
            }
          ],
          "recentPerformance": [
            {
              $match: {
                status: 'completed',
                completedAt: { $gte: fiveMinutesAgo }
              }
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    const counts = stats[0].counts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, { pending: 0, processing: 0, completed: 0, failed: 0 });

    const recentCompletedCount = stats[0].recentPerformance[0]?.count || 0;
    const processingRatePerSecond = recentCompletedCount / 300; // 300 seconds in 5 minutes

    let estimatedTimeToClearSeconds = 0;
    if (processingRatePerSecond > 0 && counts.pending > 0) {
      estimatedTimeToClearSeconds = Math.round(counts.pending / processingRatePerSecond);
    }

    res.json({
      ok: true,
      queueStatus: {
        totalCounts: counts,
        performance: {
          completedLast5Min: recentCompletedCount,
          ratePerSecond: parseFloat(processingRatePerSecond.toFixed(2)),
        },
        estimatedTimeToClearSeconds: estimatedTimeToClearSeconds,
      }
    });

  } catch (error) {
    console.error('[QueueStatus] Error fetching queue status:', error);
    res.status(500).json({ ok: false, error: 'Server Error' });
  }
});

module.exports = router;