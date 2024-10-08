const cluster = require('cluster');
const os = require('os');
const express = require('express');
const redis = require('redis');
const Bull = require('bull');
const fs = require('fs');


if (cluster.isMaster) {
    //  (replica sets)
    for (let i = 0; i < 2; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} exited`);
        cluster.fork();
    });
} else {
    // Worker process 
    const app = express();
    app.use(express.json());

    const redisClient = redis.createClient();

    (async () => {
        try {
            await redisClient.connect();
            console.log('Connected to Redis');
            await redisClient.flushAll(); // Clear Redis for fresh test
        } catch (err) {
            console.error('Redis connection error:', err);
        }
    })();

    const logFilePath = 'task_log.txt';
    const taskQueue = new Bull('taskQueue', {
        redis: {
            host: '127.0.0.1',
            port: 6379,
        },
    });

    // Task function to log task completion
    async function task(user_id) {
        const log = `${user_id} - task completed at - ${new Date().toISOString()}\n`;
        fs.appendFileSync(logFilePath, log, (err) => {
            if (err) console.error('Error writing to log file:', err);
        });
        console.log(log);
    }

    // Enforce 1 task per second per user
    async function enforceTaskDelay(user_id) {
        const userKey = `delay:${user_id}`;
        const lastTaskTime = await redisClient.get(userKey);

        if (lastTaskTime) {
            const timeSinceLastTask = Date.now() - lastTaskTime;
            if (timeSinceLastTask < 1000) {
                const delay = 1000 - timeSinceLastTask;
                await new Promise(resolve => setTimeout(resolve, delay)); 
            }
        }

        await redisClient.set(userKey, Date.now());
    }

    // Rate limiter to ensure 20 tasks per minute per user
    async function isRateLimitExceeded(user_id) {
        const userKey = `rate_limit:${user_id}`;
        const currentCount = await redisClient.get(userKey) || 0;

        if (currentCount >= 20) {
            return true; 
        }

        await redisClient
            .multi()
            .incr(userKey) 
            .expire(userKey, 60) 
            .exec();

        return false;
    }

    // Re-queue tasks after 1 minute if rate limit was exceeded
    async function requeueAfterCooldown(user_id) {
        setTimeout(async () => {
            const rateLimitExceeded = await isRateLimitExceeded(user_id);
            if (!rateLimitExceeded) {
                await taskQueue.add({ user_id });
            }
        }, 60 * 1000); 
    }

    // Add tasks to the queue with rate limiting and delay enforcement
    taskQueue.process(async (job) => {
        const { user_id } = job.data;

        await enforceTaskDelay(user_id);
        await task(user_id);
    });

    // Route to handle task submissions
    app.post('/task', async (req, res) => {
        const { user_id } = req.body;

        if (!user_id) {
            return res.status(400).send('user_id is required');
        }

        try {
            const rateLimitExceeded = await isRateLimitExceeded(user_id);

            if (rateLimitExceeded) {
                res.status(200).send('Rate limit exceeded, task queued and will be reprocessed after 1 minute');
                // Requeue tasks after the 1-minute cooldown
                await requeueAfterCooldown(user_id);
            } else {
                // Add task to the queue
                await taskQueue.add({ user_id });
                res.status(200).send('Task added to queue');
            }
        } catch (err) {
            console.error('Error adding task to queue:', err);
            res.status(500).send('Error processing task');
        }
    });

    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`Worker ${process.pid} running on port ${PORT}`);
    });
}
