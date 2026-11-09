'use strict';

// 점검 큰 안내 신호 파일, maintenance_notice 모양 만들기 + 접속할 때·바뀔 때 이 Node 접속자에게 보내기
// socket/socket.js가 접속 때, maintenanceClock.js가 다시 읽은 뒤·시작 시각에 부름 (화면은 frontend/src/domains/maintenance)
const maintenance = require('./maintenance');

const NOTICE_EVENT = 'maintenance_notice';
const SCHEDULED_MESSAGE = '서버 점검이 예정되어 있어요.';

// 마지막으로 이 Node 접속자에게 보낸 안내 (같은 안내 두 번 안 보내기용), 처음은 꺼짐으로 침
let lastSentSignature = 'cleared';

const toMs = (isoText) => (isoText ? Date.parse(isoText) : NaN);

// 점검 상태(getMaintenanceState 모양) → 신호 모양, 시각은 ISO(UTC)
// 예: { enabled:true, startsAt:'…03:10Z' }, 지금 03:00 → { state:'scheduled', …, serverNow:'…03:00Z', forceEndAtStart:true }
const buildNotice = (state, now = Date.now()) => {
    const serverNow = new Date(now).toISOString();
    if (!state?.enabled) {
        return { state: 'cleared', message: null, startsAt: null, endsAt: null, serverNow, forceEndAtStart: true };
    }
    // 시작 시각 없으면 바로 점검 중 (isMaintenanceActive와 같은 규칙)
    const active = !state.startsAt || toMs(state.startsAt) <= now;
    return {
        state: active ? 'active' : 'scheduled',
        message: state.message ?? (active ? maintenance.DEFAULT_MESSAGE : SCHEDULED_MESSAGE),
        startsAt: state.startsAt ?? null,
        endsAt: state.endsAt ?? null,
        serverNow,
        forceEndAtStart: true,
    };
};

// 같은 안내인지 가리는 글자 (지금 시각은 빼고 봄)
const signatureOf = (payload) => (payload.state === 'cleared'
    ? 'cleared'
    : [payload.state, payload.message, payload.startsAt, payload.endsAt].join('|'));

// 이 Node 접속자에게만 보냄 (io.local), 마지막 안내와 같으면 안 보냄 → 보냈으면 true
// io.emit이면 어댑터 타고 다른 Node 접속자도 받아 Node 수만큼 겹침 → Node마다 자기 접속자만
const broadcastState = (io, state, now = Date.now()) => {
    if (!io) return false;
    const payload = buildNotice(state, now);
    const signature = signatureOf(payload);
    if (signature === lastSentSignature) return false;
    (io.local ?? io).emit(NOTICE_EVENT, payload);
    lastSentSignature = signature;
    return true;
};

// 접속할 때: 켜짐이면(예약됨·점검 중) 그 소켓에 한 번
const sendOnConnect = (socket, now = Date.now()) => {
    const state = maintenance.getMaintenanceState(new Date(now));
    if (!state.enabled) return false;
    socket.emit(NOTICE_EVENT, buildNotice(state, now));
    return true;
};

module.exports = {
    NOTICE_EVENT,
    buildNotice,
    broadcastState,
    sendOnConnect,
    __resetForTests: () => { lastSentSignature = 'cleared'; },
};
