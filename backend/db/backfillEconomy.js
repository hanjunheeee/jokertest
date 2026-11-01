'use strict';

const economyService = require('../services/economy');

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_RETRIES = 2;

const backfillDefaultEntitlements = async ({
    db = require('../models'),
    batchSize = DEFAULT_BATCH_SIZE,
    startAfterUuid = null,
    maxRetries = DEFAULT_MAX_RETRIES,
    onCheckpoint = () => {},
    onProgress = () => {},
} = {}) => {
    const { Op } = db.Sequelize;
    let cursor = startAfterUuid;
    let resumeAfterUuid = startAfterUuid;
    let processed = 0;
    let granted = 0;
    const failures = [];

    for (;;) {
        const users = await db.User.findAll({
            where: cursor ? { uuid: { [Op.gt]: cursor } } : {},
            order: [['uuid', 'ASC']],
            limit: batchSize,
            attributes: ['uuid'],
        });
        if (users.length === 0) break;

        for (const user of users) {
            let succeeded = false;
            let lastError = null;
            for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
                try {
                    await economyService.ensureDefaultEntitlements(user.uuid, db);
                    succeeded = true;
                    break;
                } catch (error) {
                    lastError = error;
                }
            }
            processed += 1;
            if (succeeded) {
                granted += 1;
                if (failures.length === 0) resumeAfterUuid = user.uuid;
            } else {
                failures.push({ userId: user.uuid, message: lastError?.message ?? String(lastError) });
            }
        }

        cursor = users[users.length - 1].uuid;
        await onCheckpoint(resumeAfterUuid);
        await onProgress({ processed, granted, failedCount: failures.length, lastUuid: cursor, resumeAfterUuid });

        if (users.length < batchSize) break;
    }

    return { processed, granted, failures };
};

module.exports = { backfillDefaultEntitlements, DEFAULT_BATCH_SIZE, DEFAULT_MAX_RETRIES };
