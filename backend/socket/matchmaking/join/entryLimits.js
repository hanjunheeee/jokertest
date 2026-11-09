// 입장 시도 제한 파일
// 사람별 코드 입장 시도 횟수 제한, join(코드·공개 방)이 봄 (코드 맞히기 막기, BE-025)
// Node 여러 개면 Redis join:<uuid>로 합쳐 셈 (Node를 옮겨 다니며 한도 N배 막기, MN-019), Redis 죽으면 cluster가 메모리로
const cluster = require('../../../cluster')

// 1분에 코드 입장 시도 20번까지 (정상 사용엔 넉넉, 6자리 코드 맞히기엔 턱없이 적음)
const JOIN_ATTEMPT_WINDOW_MS = 60 * 1000
const JOIN_ATTEMPT_LIMIT = 20

// 사람별 시도 묶음 (uuid → { startedAt, count })
const joinAttemptsByUuid = new Map()

// 기한 지난 시도 묶음 지우기 (사람이 많을 때만, 따로 타이머 없음)
function pruneJoinAttempts(now) {
    if (joinAttemptsByUuid.size < 1000) return
    for (const [uuid, entry] of joinAttemptsByUuid) {
        if (now - entry.startedAt >= JOIN_ATTEMPT_WINDOW_MS) joinAttemptsByUuid.delete(uuid)
    }
}

// 코드 입장 시도 하나 세기, 한도 넘으면 false
function takeJoinAttempt(uuid, now = Date.now()) {
    pruneJoinAttempts(now)
    const entry = joinAttemptsByUuid.get(uuid)
    if (!entry || now - entry.startedAt >= JOIN_ATTEMPT_WINDOW_MS) {
        joinAttemptsByUuid.set(uuid, { startedAt: now, count: 1 })
        return true
    }
    entry.count += 1
    return entry.count <= JOIN_ATTEMPT_LIMIT
}

// Node끼리 합쳐 세는지 (REDIS_URL 있음), 아니면 아래 takeJoinAttempt 그대로
const isJoinLimitShared = () => cluster.isEnabled()

// 합쳐 세기: 하나 세고 한도 안이면 true
async function takeSharedJoinAttempt(uuid) {
    const { count } = await cluster.counters.hit(`join:${uuid}`, JOIN_ATTEMPT_WINDOW_MS)
    return count <= JOIN_ATTEMPT_LIMIT
}

// 시험용: 시도 묶음 비우기
function __resetEntryLimitsForTests() {
    joinAttemptsByUuid.clear()
}

module.exports = {
    JOIN_ATTEMPT_WINDOW_MS,
    JOIN_ATTEMPT_LIMIT,
    takeJoinAttempt,
    isJoinLimitShared,
    takeSharedJoinAttempt,
    __resetEntryLimitsForTests,
}
