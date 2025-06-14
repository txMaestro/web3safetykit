const Job = require('../models/Job');

class JobService {
  /**
   * Creates a new job to be processed by a worker.
   * @param {string} walletId - The ID of the wallet to be analyzed.
   * @param {string} taskType - The type of analysis to perform.
   * @param {object} [payload={}] - Additional data for the job.
   * @returns {Promise<Job>}
   */
  static async createJob(walletId, taskType, payload = {}) {
    try {
      const job = new Job({
        walletId,
        taskType,
        payload,
      });
      await job.save();
      console.log(`[JobService] Created job ${job._id} of type ${taskType} for wallet ${walletId}`);
      return job;
    } catch (error) {
      console.error(`[JobService] Error creating job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetches a pending job for a specific worker type and marks it as 'processing'.
   * This is an atomic operation to prevent multiple workers from picking up the same job.
   * @param {string} taskType - The type of task the worker can handle.
   * @returns {Promise<Job|null>}
   */
  static async getNextPendingJob(taskType) {
    try {
      const job = await Job.findOneAndUpdate(
        { status: 'pending', taskType: taskType },
        { $set: { status: 'processing', processedAt: new Date() } },
        { new: true, sort: { createdAt: 1 } }
      );
      return job;
    } catch (error) {
      console.error(`[JobService] Error fetching next pending job: ${error.message}`);
      throw error;
    }
  }

  /**
   * Marks a job as completed.
   * @param {string} jobId - The ID of the job.
   * @returns {Promise<void>}
   */
  static async completeJob(jobId) {
    try {
      await Job.updateOne({ _id: jobId }, { $set: { status: 'completed' } });
      console.log(`[JobService] Completed job ${jobId}`);
    } catch (error) {
      console.error(`[JobService] Error completing job ${jobId}: ${error.message}`);
    }
  }

  /**
   * Marks a job as failed and increments the attempt count.
   * @param {string} jobId - The ID of the job.
   * @returns {Promise<void>}
   */
  static async failJob(jobId) {
    try {
      await Job.updateOne({ _id: jobId }, { $set: { status: 'failed' }, $inc: { attempts: 1 } });
      console.log(`[JobService] Failed job ${jobId}`);
    } catch (error) {
      console.error(`[JobService] Error failing job ${jobId}: ${error.message}`);
    }
  }
}

module.exports = JobService;