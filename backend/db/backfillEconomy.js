'use strict';

// F-08 기존 계정 기본 지급 백필(CODEX-2 AC-03 대응). 신규 가입(auth.service.js signup()·
// socialAuth.service.js completeSocialSignup())은 이제 계정 생성 트랜잭션 안에서
// economyService.ensureDefaultEntitlements를 직접 호출해 기본 프로필 16종 + 평민 테두리
// 1종 + 지갑(0/0)을 가입 즉시 보유한다 — 하지만 이 슬라이스 이전에 이미 만들어진 기존
// 계정은 그 훅을 거친 적이 없다("lazy grant on wallet/equip is NOT signup/backfill" —
// wallet/equip 조회 시점의 지연 지급은 이관 절차를 대신하지 못한다). 이 모듈이 그 기존
// 계정들에 같은 지급을 배치·체크포인트·재시도 안전하게 적용한다.
//
// 운영 배포에서 자동으로 실행되지 않는다 — backend/index.js는 이 모듈을 import하지 않고,
// 어떤 기동 경로도 이 함수를 자동 호출하지 않는다. 반드시
// backend/db/backfillEconomy.cli.js를 통해 사람이 명시적으로 실행해야 한다.

const economyService = require('../service/economy.service');

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_RETRIES = 2;

/**
 * users 테이블을 uuid 오름차순으로 배치 처리하며 각 계정에
 * economyService.ensureDefaultEntitlements를 적용한다.
 *
 * - 배치(batch): batchSize만큼씩 끊어 읽어 한 번에 메모리에 올리는 계정 수를 제한한다 —
 *   전체 계정을 한 번에 메모리에 올리지 않아 대규모 users 테이블에서도 안전하다.
 * - 체크포인트(checkpoint): 매 배치가 끝날 때마다 그 배치의 마지막 uuid를 onCheckpoint로
 *   보고한다. 호출부(CLI)가 그 값을 기록해 두면, 중간에 프로세스가 죽거나 중단되어도
 *   다음 실행에 startAfterUuid로 그 값을 넘겨 이미 끝난 구간을 다시 훑지 않고 이어서
 *   재개할 수 있다.
 * - 재시도 안전(retry-safe): ensureDefaultEntitlements 자체가 멱등이다(이미 지급된 항목은
 *   (user_id, reference_event_id) 유일 제약으로 조용히 건너뛰고, 기존 유효 장착 선택도
 *   덮어쓰지 않는다) — 그래서 같은 계정을 몇 번을 다시 처리해도 중복 지급되지 않는다.
 *   한 계정이 실패하면(일시적 DB 오류 등) maxRetries만큼 즉시 재시도하고, 그래도
 *   실패하면 failures에 모아 배치 처리 자체는 멈추지 않는다(한 계정의 오류가 전체
 *   백필을 중단시키지 않는다) — failures에 남은 계정은 재실행하면 멱등이므로 안전하게
 *   다시 시도할 수 있다.
 *
 * @returns {Promise<{processed:number, granted:number, failures:Array<{userId:string,message:string}>}>}
 */
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
            } else {
                failures.push({ userId: user.uuid, message: lastError?.message ?? String(lastError) });
            }
        }

        cursor = users[users.length - 1].uuid;
        onCheckpoint(cursor);
        onProgress({ processed, granted, failedCount: failures.length, lastUuid: cursor });

        if (users.length < batchSize) break;
    }

    return { processed, granted, failures };
};

module.exports = { backfillDefaultEntitlements, DEFAULT_BATCH_SIZE, DEFAULT_MAX_RETRIES };
