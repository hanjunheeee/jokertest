// 탈주 기록·막힘 표 파일, 탈주 적기(그날 몇 번째인지·막힘 끝 계산) + 사람별 막힘 끝을 메모리에 들고 다른 Node에 알림
// 판 나가기·끊김 탈락(단위 13)이 recordDesertion, 방 만들기·입장·초대 수락·매칭 검사(matchmaking/join/guards)가 getDesertionBlock을 부름
const cluster = require('../../cluster')
const { REASONS } = require('../../db/migrations/0033-add-game-desertions')

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
// 한국 시간 = 세계 표준시 + 9시간 (서버 시간대 설정에 안 기대고 직접 셈)
const KST_OFFSET_MS = 9 * HOUR_MS

// 그날 몇 번째 탈주인지별 대기 시간: 1번째 5분, 2번째 30분, 3번째부터 1일
const COOLDOWN_STEPS_MS = Object.freeze([5 * MINUTE_MS, 30 * MINUTE_MS, DAY_MS])

// Node끼리 "이 사람 막힘" 알리는 버스 이름 (받는 처리기는 아래에서 붙임)
const BUS_DESERTION_BLOCKED = 'desertion.blocked'
// 막힘 표 읽기 실패 뒤 다시 해 보기까지 기다림 (DB가 죽어 있을 때 검사마다 DB를 안 부르게)
const WARMUP_RETRY_MS = 30 * SECOND_MS

// 그 시각이 든 한국 날의 0시 (ms), 예: 2026-11-16T15:30Z(한국 17일 0:30) → 2026-11-16T15:00Z(한국 17일 0:00)
function kstDayStart(ms) {
    return Math.floor((ms + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS
}

// 그날 몇 번째 탈주의 대기 시간, 4번째부터도 1일 (예: 1 → 5분, 2 → 30분, 5 → 1일)
function cooldownMsFor(nth) {
    const step = Math.min(Math.max(Math.trunc(nth) || 1, 1), COOLDOWN_STEPS_MS.length)
    return COOLDOWN_STEPS_MS[step - 1]
}

// 탈주 시각 + 그날 앞선 탈주 수 → { nth(몇 번째), blockedUntilMs(막힘 끝) }, 자정이 지나도 막힘 끝은 그대로
function computeBlock(desertedAtMs, priorCountToday) {
    const nth = Math.max(0, Math.trunc(priorCountToday) || 0) + 1
    return { nth, blockedUntilMs: desertedAtMs + cooldownMsFor(nth) }
}

// 남은 시간 → "○시간 ○분 ○초" (초는 올림, 막힌 동안 "0초"가 안 나오게), 예: 299001 → '5분 0초', 299000 → '4분 59초'
function formatWait(ms) {
    const totalSeconds = Math.max(1, Math.ceil(ms / SECOND_MS))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const parts = []
    if (hours > 0) parts.push(`${hours}시간`)
    if (hours > 0 || minutes > 0) parts.push(`${minutes}분`)
    parts.push(`${seconds}초`)
    return parts.join(' ')
}

// 거절 안내 글 (화면은 이 글을 그대로 띄움)
function desertionWaitMessage(remainingMs) {
    return `탈주로 ${formatWait(remainingMs)} 뒤에 참여할 수 있습니다.`
}

// 날짜 값 → ms (Date·글자·숫자 다 받음, 못 읽으면 NaN)
const toMs = (value) => (value instanceof Date ? value.getTime() : new Date(value).getTime())
const isText = (value) => typeof value === 'string' && value.length > 0
const REASON_VALUES = Object.freeze(Object.values(REASONS))

// 사람 → 막힘 끝 ms (입장 검사는 이것만 봄, DB 안 부름)
const blocks = new Map()
// 사람 → { dayStart, gameIds } 오늘(한국 날) 탈주한 판 (몇 번째인지 셀 때 DB가 안 될 때 씀·같은 판 두 번 막기)
const todayGames = new Map()
// 같은 사람 같은 판을 적는 중인 일 (동시에 두 번 불려도 한 번만 적음)
const inflight = new Map()

// 시험이 저장소를 바꿔 끼울 수 있게 (없으면 진짜 저장소, 불러올 때 DB 주소를 안 요구하게 늦게 부름)
let repositoryOverride = null
const repo = () => repositoryOverride ?? require('../../repositories/game/desertion')

// 막힘 끝 넣기: 이미 더 늦은 끝이 있으면 그대로 (Node끼리 알림 순서가 바뀌어도 짧아지지 않게)
function applyBlock(uuid, blockedUntilMs, now = Date.now()) {
    if (!Number.isFinite(blockedUntilMs) || blockedUntilMs <= now) return
    const current = blocks.get(uuid)
    if (current === undefined || blockedUntilMs > current) blocks.set(uuid, blockedUntilMs)
}

// 오늘 탈주한 판 적기 (탈주 시각이 지금과 다른 한국 날이면 안 적음)
function noteTodayGame(uuid, gameId, desertedAtMs, now = Date.now()) {
    const today = kstDayStart(now)
    if (!Number.isFinite(desertedAtMs) || kstDayStart(desertedAtMs) !== today) return
    let entry = todayGames.get(uuid)
    if (!entry || entry.dayStart !== today) {
        entry = { dayStart: today, gameIds: new Set() }
        todayGames.set(uuid, entry)
    }
    entry.gameIds.add(gameId)
}

// 메모리로 센 그날 앞선 탈주 수 (지금 적는 판은 뺌)
function localCountBefore(uuid, gameId, desertedAtMs) {
    const entry = todayGames.get(uuid)
    if (!entry || entry.dayStart !== kstDayStart(desertedAtMs)) return 0
    return [...entry.gameIds].filter((id) => id !== gameId).length // 다른 판만 → ['g1','g2'] 중 g2 적는 중이면 1
}

// 이 판을 오늘 이미 적었는지 (메모리)
function hasLocalRecord(uuid, gameId, now = Date.now()) {
    const entry = todayGames.get(uuid)
    return Boolean(entry && entry.dayStart === kstDayStart(now) && entry.gameIds.has(gameId))
}

// 끝난 막힘·지난 날 횟수 지우기 (탈주가 생길 때만 돌림, 표가 안 커지게)
function pruneExpired(now = Date.now()) {
    for (const [uuid, until] of blocks) if (until <= now) blocks.delete(uuid)
    const today = kstDayStart(now)
    for (const [uuid, entry] of todayGames) if (entry.dayStart !== today) todayGames.delete(uuid)
}

// 내 Node에 걸고 다른 Node에 알림 (Redis 없거나 끊기면 알림은 안 감 → Redis 살아날 때 DB 다시 읽기가 메움)
function applyAndShare(uuid, gameId, desertedAtMs, blockedUntilMs) {
    applyBlock(uuid, blockedUntilMs)
    noteTodayGame(uuid, gameId, desertedAtMs)
    void cluster.bus.publish(BUS_DESERTION_BLOCKED, { uuid, gameId, desertedAt: desertedAtMs, blockedUntil: blockedUntilMs })
}

// 서버 켤 때 한 번: 아직 막힌 줄·오늘 탈주 줄을 DB에서 읽어 막힘 표·오늘 횟수 채움 → { ok, count }
// 실패하면 로그만, 30초 뒤 다음 검사 때 다시 해 봄 (서버는 그대로 돎)
let warmState = 'idle'
let warmRetryAt = 0
async function loadActiveDesertions(now = Date.now()) {
    warmState = 'loading'
    try {
        const rows = await repo().findDesertionsForWarmup({ now: new Date(now), todayStart: new Date(kstDayStart(now)) })
        for (const row of rows) {
            applyBlock(row.user_id, toMs(row.blocked_until), now)
            noteTodayGame(row.user_id, row.game_id, toMs(row.deserted_at), now)
        }
        warmState = 'done'
        return { ok: true, count: rows.length }
    } catch (error) {
        warmState = 'idle'
        warmRetryAt = Date.now() + WARMUP_RETRY_MS
        console.warn('[탈주] 막힘 기록 못 읽음 —', error?.name ?? 'Error')
        return { ok: false, count: 0 }
    }
}

// 아직 안 읽었으면 뒤에서 한 번 읽기 시작 (index.js가 켤 때 안 불렀을 때의 대비, 기다리지 않음)
function ensureWarm(now) {
    if (warmState === 'idle' && now >= warmRetryAt) void loadActiveDesertions(now)
}

// 입장 검사용: 막혔으면 { blockedUntil(ms), retryAfterMs }, 아니면 null (메모리만 봄)
function getDesertionBlock(uuid, now = Date.now()) {
    ensureWarm(now)
    const until = blocks.get(uuid)
    if (until === undefined) return null
    if (until <= now) {
        blocks.delete(uuid)
        return null
    }
    return { blockedUntil: until, retryAfterMs: until - now }
}

// 돌려줄 결과 모양
const resultOf = ({ recorded, saved, nth, desertedAtMs, blockedUntilMs }, now = Date.now()) => ({
    ok: true,
    recorded,
    saved,
    nth,
    desertedAt: new Date(desertedAtMs),
    blockedUntil: new Date(blockedUntilMs),
    retryAfterMs: Math.max(0, blockedUntilMs - now),
})

// 실제 적기: 메모리 횟수로 먼저 막음 → DB에서 그날 횟수 세기(읽기 1번) → 한 줄 쓰기(쓰기 1번)
// DB가 안 되면 로그만, 막힘은 이미 걸려 있음
async function runRecord({ userId, gameId, reason, desertedAtMs }) {
    pruneExpired()
    // 같은 판을 오늘 이미 적었으면 그때 막힘 그대로 (DB 안 부름)
    if (hasLocalRecord(userId, gameId)) {
        const until = blocks.get(userId) ?? desertedAtMs
        return resultOf({ recorded: false, saved: true, nth: null, desertedAtMs, blockedUntilMs: until })
    }

    const localPrior = localCountBefore(userId, gameId, desertedAtMs)
    let block = computeBlock(desertedAtMs, localPrior)
    applyAndShare(userId, gameId, desertedAtMs, block.blockedUntilMs)

    try {
        const dbPrior = await repo().countDesertionsSince({
            userId, since: new Date(kstDayStart(desertedAtMs)), excludeGameId: gameId,
        })
        // DB가 더 많이 알면 그쪽으로 (다른 Node에서 탈주했는데 알림을 못 받은 경우)
        if (dbPrior > localPrior) {
            block = computeBlock(desertedAtMs, dbPrior)
            applyAndShare(userId, gameId, desertedAtMs, block.blockedUntilMs)
        }
        const { created, row } = await repo().insertDesertion({
            userId, gameId, reason, desertedAt: new Date(desertedAtMs), blockedUntil: new Date(block.blockedUntilMs),
        })
        // 같은 판 줄이 이미 있음 (유일 인덱스): 그때 막힘 끝을 그대로 씀
        if (!created && row) {
            const until = toMs(row.blocked_until)
            applyBlock(userId, until)
            return resultOf({ recorded: false, saved: true, nth: null, desertedAtMs: toMs(row.deserted_at), blockedUntilMs: until })
        }
        return resultOf({ recorded: true, saved: true, nth: block.nth, desertedAtMs, blockedUntilMs: block.blockedUntilMs })
    } catch (error) {
        console.error('[탈주] 기록 못 씀 — 막힘은 메모리에 걸어 둠', { userId, gameId, error: error?.name ?? 'Error' })
        return resultOf({ recorded: true, saved: false, nth: block.nth, desertedAtMs, blockedUntilMs: block.blockedUntilMs })
    }
}

// 탈주 적기 (단위 13이 산 채로 나가기·끊긴 뒤 60초 탈락 때 부름)
// 받는 값: { userId(users.uuid), gameId, reason(REASONS 중 하나), desertedAt?(Date·ms, 없으면 지금) }
// 돌려줌(던지지 않음): { ok:true, recorded, saved, nth, desertedAt, blockedUntil, retryAfterMs } / 받는 값이 틀리면 { ok:false, code:'INVALID_DESERTION' }
function recordDesertion({ userId, gameId, reason, desertedAt } = {}) {
    const desertedAtMs = desertedAt === undefined ? Date.now() : toMs(desertedAt)
    if (!isText(userId) || !isText(gameId) || !REASON_VALUES.includes(reason) || !Number.isFinite(desertedAtMs)) {
        return Promise.resolve({ ok: false, code: 'INVALID_DESERTION' })
    }
    const key = `${userId}:${gameId}`
    if (inflight.has(key)) return inflight.get(key)
    const job = runRecord({ userId, gameId, reason, desertedAtMs }).finally(() => inflight.delete(key))
    inflight.set(key, job)
    return job
}

// 다른 Node가 막음 → 내 표에도 걸기 (틀린 모양은 버림)
cluster.bus.on(BUS_DESERTION_BLOCKED, (msg) => {
    if (!isText(msg.uuid) || !isText(msg.gameId)) return
    applyBlock(msg.uuid, Number(msg.blockedUntil))
    noteTodayGame(msg.uuid, msg.gameId, Number(msg.desertedAt))
})

// Redis가 다시 살아남 → 끊긴 동안 놓친 알림 대신 DB 한 번 다시 읽기
cluster.onResync(() => loadActiveDesertions())

module.exports = {
    DESERTION_REASONS: REASONS,
    recordDesertion,
    getDesertionBlock,
    loadActiveDesertions,
    desertionWaitMessage,
    // 순수 계산 (시험·화면 글 맞추기용)
    kstDayStart,
    cooldownMsFor,
    computeBlock,
    formatWait,
    __setRepositoryForTests: (fake) => { repositoryOverride = fake ?? null },
    __resetForTests: () => {
        blocks.clear()
        todayGames.clear()
        inflight.clear()
        warmState = 'idle'
        warmRetryAt = 0
    },
}
