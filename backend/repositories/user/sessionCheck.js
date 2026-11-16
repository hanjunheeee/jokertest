// 세션 확인 묶음 저장소 파일, 소켓 세션 확인(세션·계정 상태·정지)을 질의 하나로 + 같은 차례 확인 여럿을 한 번에
// sessionLifecycle.resolveSession(소켓 쪽 batch 길)이 부름, http 요청 확인은 옛 두 질의 그대로
const db = require("../../models");
const { WITHDRAWN_STATUS } = require("./withdraw");

// 한 번에 묻는 세션 수 (IN 목록 너무 길어지지 않게)
const MAX_IDS_PER_QUERY = 500;

// 세션 + 계정 상태 + 지금 걸린 정지 하나를 질의 하나로 (모델 안 거침: 질의마다 설정 복사 몫 줄이기)
// 조건은 findActiveSession·checkActiveBan과 같음: 접속 중·폐기 안 됨, 지운 계정(deleted_at)은 상태 없음,
// 정지는 시작 시각 없거나 지났고 영구거나 끝 시각 안 지남
const SESSION_CHECK_SQL = `
SELECT s.id AS session_id, s.user_id, s.is_online, s.refresh_token_expires_at, u.status,
  (SELECT b.id FROM user_bans b WHERE b.user_id = s.user_id
     AND (b.start_at IS NULL OR b.start_at <= :now) AND (b.is_permanent = 1 OR b.end_at > :now) LIMIT 1) AS ban_id,
  (SELECT b.reason FROM user_bans b WHERE b.user_id = s.user_id
     AND (b.start_at IS NULL OR b.start_at <= :now) AND (b.is_permanent = 1 OR b.end_at > :now) LIMIT 1) AS ban_reason
FROM user_sessions s
LEFT JOIN users u ON u.uuid = s.user_id AND u.deleted_at IS NULL
WHERE s.id IN (:ids) AND s.is_online = 1 AND s.revoked_at IS NULL`;

// 지금 시각 → UTC 글자 (예: 2026-11-10T01:00:00.000Z → '2026-11-10 01:00:00.000')
// raw 질의 replacements는 Date를 이 PC 시간대 글자로 바꿈(한국이면 9시간 앞), 모델·DB 연결은 UTC라 글자로 직접 넘기기
const toUtcSqlText = (date) => date.toISOString().slice(0, 23).replace('T', ' ');

// 세션 id 여럿 한 번에: 세션 id → 줄 Map (없거나 끊긴 세션은 빠짐)
const querySessionStates = async (sessionIds) => {
    const rows = new Map();
    for (let i = 0; i < sessionIds.length; i += MAX_IDS_PER_QUERY) {
        const ids = sessionIds.slice(i, i + MAX_IDS_PER_QUERY);
        const found = await db.sequelize.query(SESSION_CHECK_SQL, {
            replacements: { ids, now: toUtcSqlText(new Date()) },
            type: db.Sequelize.QueryTypes.SELECT,
        });
        for (const row of found) rows.set(row.session_id, row);
    }
    return rows;
};

// 세션이 안 잡힌 사람의 계정 상태 + 지금 걸린 정지 + 살아 있는 다른 세션 있나 (지운 계정 줄도 봄), 정지 조건은 위 질의와 같음
// 정지 직후 http 요청이 먼저 세션을 끊어 두면 소켓은 세션이 없어도 정지 까닭으로 끊어야 함 (안 보면 "세션 만료" 글이 뜸)
// 살아 있는 다른 세션 = 새 로그인이 옛 세션을 끊고 만든 것 (세션 만드는 곳은 로그인 하나뿐, 한 사람 한 세션)
const GONE_CHECK_SQL = `
SELECT u.uuid, u.status,
  (SELECT b.id FROM user_bans b WHERE b.user_id = u.uuid
     AND (b.start_at IS NULL OR b.start_at <= :now) AND (b.is_permanent = 1 OR b.end_at > :now) ORDER BY b.id LIMIT 1) AS ban_id,
  (SELECT b.reason FROM user_bans b WHERE b.user_id = u.uuid
     AND (b.start_at IS NULL OR b.start_at <= :now) AND (b.is_permanent = 1 OR b.end_at > :now) ORDER BY b.id LIMIT 1) AS ban_reason,
  EXISTS (SELECT 1 FROM user_sessions s WHERE s.user_id = u.uuid AND s.is_online = 1 AND s.revoked_at IS NULL) AS has_live_session
FROM users u
WHERE u.uuid IN (:uuids)`;

// 세션이 안 잡힌 사람 uuid → 끊는 까닭 { withdrawn: true } | { ban } | { replaced: true } Map (탈퇴 → 정지 → 새 로그인 차례, 다 아니면 빠짐)
// 끊는 까닭을 고르는 데만 씀, 보통은 0명이라 질의 없음 (질의 한 번에 탈퇴·정지·다른 세션 같이)
const queryGoneReasons = async (uuids) => {
    const reasons = new Map();
    if (uuids.length === 0) return reasons;
    const rows = await db.sequelize.query(GONE_CHECK_SQL, {
        replacements: { uuids, now: toUtcSqlText(new Date()) },
        type: db.Sequelize.QueryTypes.SELECT,
    });
    for (const row of rows) {
        if (row.status === WITHDRAWN_STATUS) reasons.set(row.uuid, { withdrawn: true });
        else if (row.ban_id !== null && row.ban_id !== undefined) reasons.set(row.uuid, { ban: { id: row.ban_id, reason: row.ban_reason } });
        else if (Number(row.has_live_session) === 1) reasons.set(row.uuid, { replaced: true });
    }
    return reasons;
};

// 줄 하나를 옛 두 질의 결과 모양으로: [세션(User.status 붙음) | null, 정지 | null]
// 세션 주인이 토큰 uuid와 다르면 없음 (옛 질의 where의 user_id 조건)
// 세션이 없는데 탈퇴·정지·새 로그인에 밀림이면 셋째 칸에 { withdrawn: true } | { ban } | { replaced: true } (소켓을 그 까닭으로 끊게)
const toSessionAndBan = (row, uuid, gone = null) => {
    if (!row || row.user_id !== uuid) return gone ? [null, null, gone] : [null, null];
    const session = {
        id: row.session_id,
        user_id: row.user_id,
        is_online: row.is_online,
        refresh_token_expires_at: row.refresh_token_expires_at,
        User: row.status === null || row.status === undefined ? null : { status: row.status },
    };
    const ban = row.ban_id === null || row.ban_id === undefined ? null : { id: row.ban_id, reason: row.ban_reason };
    return [session, ban];
};

// 같은 차례(동기 코드 한 덩이)에 들어온 확인을 모아 질의 한 번 (5초 주기 검사가 접속자 전원을 한 차례에 부름)
let pending = null;

const flush = async (batch) => {
    try {
        const ids = [...new Set(batch.map((item) => item.sessionId))];
        const rows = await querySessionStates(ids);
        // 세션이 안 잡힌 사람만 탈퇴·정지·새 로그인인지 한 번에 물음 (보통은 0명이라 질의 없음)
        const missing = batch.filter((item) => rows.get(item.sessionId)?.user_id !== item.uuid).map((item) => item.uuid);
        const goneReasons = await queryGoneReasons([...new Set(missing)]);
        for (const item of batch) {
            item.resolve(toSessionAndBan(rows.get(item.sessionId), item.uuid, goneReasons.get(item.uuid) ?? null));
        }
    } catch (error) {
        for (const item of batch) item.reject(error);
    }
};

// 세션 하나 확인 신청 → [세션 | null, 정지 | null] (id·uuid 없으면 DB 안 감), 세션 없는 탈퇴·정지·새 로그인이면 셋째 칸 { withdrawn: true } | { ban } | { replaced: true }
exports.loadSessionCheck = (sessionId, uuid) => {
    if (!sessionId || !uuid) return Promise.resolve([null, null]);
    return new Promise((resolve, reject) => {
        if (!pending) {
            pending = [];
            const batch = pending;
            queueMicrotask(() => {
                pending = null;
                flush(batch);
            });
        }
        pending.push({ sessionId, uuid, resolve, reject });
    });
};

exports.MAX_IDS_PER_QUERY = MAX_IDS_PER_QUERY;
exports.__testables = { SESSION_CHECK_SQL, toSessionAndBan, querySessionStates };
