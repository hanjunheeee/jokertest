'use strict';

// 관리자 통로·시험 손잡이 부르기 파일, 시험 백엔드(4100)의 /internal(공지·끊기·점검·지금 상황)과 /e2e(역할·판 보기·단계 넘기기)
// 열쇠는 .env.e2e의 INTERNAL_API_KEY (값은 화면·로그에 안 찍음), 시험·bots.js·game.js가 씀
const { E2E, readSecrets } = require('./env');

async function call(method, pathname, body) {
    const res = await fetch(`${E2E.apiUrl}${pathname}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-internal-key': readSecrets().INTERNAL_API_KEY },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 글자 응답 */ }
    return { status: res.status, ok: res.ok, body: json ?? text };
}

// 실패면 던짐 (시험이 이유를 바로 보게)
async function must(method, pathname, body) {
    const r = await call(method, pathname, body);
    if (!r.ok) throw new Error(`${method} ${pathname} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
}

// 정할 사람 중 대기방에 든 첫 사람의 방 id (아무도 없으면 undefined → 사람 예약)
async function firstRoomIdOf(uuids) {
    for (const uuid of uuids) {
        const r = await call('GET', `/e2e/users/${encodeURIComponent(uuid)}/room`);
        if (r.ok && r.body?.room?.roomId) return r.body.room.roomId;
    }
    return undefined;
}

const internal = {
    /**
     * 공지 (모양은 backend/services/ops/announcements.js)
     * { announcementId(영문·숫자·-_ 1~64), title, body, target: 'users', userUuids: [...] } — 병렬 안전하게 늘 users로
     * target 'online'(접속자 전체)은 다른 시험 화면에도 뜨니 @serial 시험에서만
     */
    announce: (payload) => must('POST', '/internal/announcements', payload),
    /** 몇 사람에게만 공지 (id는 알아서) */
    announceTo: (uuids, { title = '시험 공지', body = '시험 공지 본문' } = {}) => must('POST', '/internal/announcements', {
        announcementId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, body, target: 'users', userUuids: uuids,
    }),
    /** 정지·비활성 반영 즉시 끊기 */
    disconnect: (uuid) => must('POST', `/internal/users/${encodeURIComponent(uuid)}/disconnect`),
    /** 점검 한 줄 다시 읽기 (먼저 DB maintenance_state 표를 고친 뒤 부름) — 모든 시험에 걸리니 @serial 시험에서만 */
    reloadMaintenance: () => must('POST', '/internal/maintenance/reload'),
    /** 금지어 다시 읽기 (먼저 DB banned_words 표에 넣은 뒤 부름) — 낱말은 시험마다 무작위로 (다른 시험 채팅에 안 걸리게) */
    reloadBannedWords: () => must('POST', '/internal/banned-words/reload'),
    /** 대기방·진행 판 요약 (명단 없음) */
    live: () => must('GET', '/internal/live'),
    raw: call,
};

const e2e = {
    /**
     * 다음 판 시작 때 역할 정하기: { [uuid]: 'JOKER'|'DOCTOR'|'GUARD'|'WITCH_HUNTER'|'CITIZEN' } (방 설정 역할 수 안에서)
     * 방 예약: roomId를 주거나, 안 주면 정할 사람 중 대기방에 든 사람의 방을 찾아 그 방 판에만 씀 (못 찾으면 사람 예약)
     * 예약은 방·사람마다 따로라 병렬 시험끼리 안 섞임, 사슬 바꿈(가→나, 나→다)도 서버가 맞춤
     * @param {Record<string,string>} presets
     * @param {{ roomId?: string }} [o]
     * @returns {Promise<{ ok:true, pending:number, scope:'room'|'users' }>}
     */
    setRoles: async (presets, { roomId } = {}) => {
        const target = roomId || await firstRoomIdOf(Object.keys(presets ?? {}));
        return must('POST', '/e2e/role-presets', target ? { presets, roomId: target } : { presets });
    },
    /**
     * 예약 지우기: clearRoles([uuid...]) · clearRoles({ uuids, roomId }) — 전부는 clearRoles({ all: true }) (남의 시험 예약도 지워지니 @serial에서만)
     */
    clearRoles: (target) => {
        if (target === undefined) throw new Error('clearRoles()는 지울 것을 줘야 함: [uuid...] · { roomId } · { all: true }(@serial에서만)');
        return must('DELETE', '/e2e/role-presets', Array.isArray(target) ? { uuids: target } : target);
    },
    /** 그 사람 판 요약 { gameId, phase, dayIndex, dayPhase, nightTurnRole, tribunal, players:[{uuid,nickname,role,alive}] } 없으면 null */
    gameOf: async (uuid) => {
        const r = await call('GET', `/e2e/users/${encodeURIComponent(uuid)}/game`);
        return r.ok ? r.body.game : null;
    },
    game: async (gameId) => {
        const r = await call('GET', `/e2e/games/${encodeURIComponent(gameId)}`);
        return r.ok ? r.body.game : null;
    },
    /** 그 사람 대기방 { roomId, roomCode, hostUuid, settingsVersion, players } 없으면 null */
    roomOf: async (uuid) => {
        const r = await call('GET', `/e2e/users/${encodeURIComponent(uuid)}/room`);
        return r.ok ? r.body.room : null;
    },
    /** 지금 단계 마감 타이머 바로 돌림 → { fired, before, after } */
    advance: (gameId) => must('POST', `/e2e/games/${encodeURIComponent(gameId)}/advance`),
};

module.exports = { internal, e2e, call };
