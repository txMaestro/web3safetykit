const JobService = require('../services/JobService');

/**
 * A generic runner for processing jobs from the queue.
 * @param {string} taskType - The type of task this runner should process.
 * @param {Function} processFunction - The async function that will process the job.
 * @param {number} interval - The interval in milliseconds to check for new jobs.
 */
const createWorker = (taskType, processFunction, interval = 5000) => {
  console.log(`[Worker] Initializing worker for task type: ${taskType}`);

  const run = async () => {
    try {
      const job = await JobService.getNextPendingJob(taskType);

      if (job) {
        console.log(`[Worker][${taskType}] Picked up job ${job._id}`);
        try {
          await processFunction(job);
          await JobService.completeJob(job._id);
        } catch (error) {
          console.error(`[Worker][${taskType}] Error processing job ${job._id}:`, error.message);
          await JobService.failJob(job._id);
        }
      }
    } catch (error) {
      console.error(`[Worker][${taskType}] Error in worker loop:`, error.message);
    } finally {
      // Check for the next job after the interval
      setTimeout(run, interval);
    }
  };

  // Start the worker loop
  run();
};

module.exports = { createWorker };