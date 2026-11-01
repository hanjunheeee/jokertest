'use strict';

const achievementService = require('./index');

const buildDeps = (overrides = {}) => ({
    get db() { return overrides.db ?? require('../../models'); },
    get achievementService() { return overrides.achievementService ?? achievementService; },
});

let deps = buildDeps();

const evaluateAllUsers = async () => {
    const { db, achievementService: service } = deps;
    const users = await db.User.findAll({ attributes: ['uuid'], raw: true });

    const summary = { usersProcessed: 0, grants: [], errors: [] };
    for (const { uuid } of users) {
        try {
            const results = await service.evaluateAndGrantForUser(uuid);
            const grantedIds = results.filter((r) => r.granted).map((r) => r.id);
            if (grantedIds.length > 0) summary.grants.push({ userId: uuid, achievementIds: grantedIds });
            summary.usersProcessed += 1;
        } catch (error) {
            summary.errors.push({ userId: uuid, message: error.message });
        }
    }
    return summary;
};

module.exports = {
    evaluateAllUsers,
    __internal: {
        __setDepsForTests(overrides) {
            deps = buildDeps(overrides ?? {});
        },
    },
};
