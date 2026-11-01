'use strict';

// 경제 기본 지급 백필 파일, 이미 있는 모든 계정에 기본 장착·기본 아이템 넣기 (uuid 순으로 묶음씩)
// db/backfillEconomy.cli.js가 부름 (시험은 가짜 db·작은 묶음으로 바로 부름)
const economyService = require('../services/economy');

// 한 번에 읽을 계정 수 · 계정마다 다시 시도 횟수
const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_RETRIES = 2;

// 묶음 읽기 → 계정마다 기본 지급(실패하면 다시) → 묶음마다 체크포인트·진행 알림
const backfillDefaultEntitlements = async ({
    db = require('../models'),
    batchSize = DEFAULT_BATCH_SIZE,
    startAfterUuid = null,
    maxRetries = DEFAULT_MAX_RETRIES,
    onCheckpoint = () => {},
    onProgress = () => {},
} = {}) => {
    const { Op } = db.Sequelize;
    // cursor = 다음에 읽을 자리, resumeAfterUuid = 다시 돌릴 때 이어 갈 자리 (첫 실패 앞에서 멈춤)
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
            // 처음 + maxRetries번까지 시도, 기본 지급은 같은 참조 id라 여러 번 돌려도 한 번만 들어감
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
            // 실패가 하나라도 생기면 이어 갈 자리는 더 안 옮김 (다시 돌릴 때 실패 계정부터)
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

        // 묶음이 덜 찼으면 마지막 묶음
        if (users.length < batchSize) break;
    }

    return { processed, granted, failures };
};

module.exports = { backfillDefaultEntitlements, DEFAULT_BATCH_SIZE, DEFAULT_MAX_RETRIES };
