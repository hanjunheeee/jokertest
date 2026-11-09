// 세션 끊김 알림 파일, 세션을 끊은 저장소 함수가 "이 사람 세션 끊김"을 알리고 소켓 세션 확인이 받아 잠깐 저장한 결과를 지움
// session.js(로그아웃·그 사람 세션 전부 끊기)가 알리고, socket/connection/sessionCheck.js가 받음
// Node 여러 개면 버스 auth.revoked로 다른 Node에도 알림 (받은 Node는 remote 표시로 같은 받는 쪽에 넘김)
const cluster = require("../../cluster");

const listeners = new Set();

// 받는 쪽 붙이기, 떼는 함수 돌려줌
// 받는 쪽은 (uuid, { remote }) 받음: remote = 다른 Node가 끊은 것 (이 Node 소켓 바로 다시 확인용)
exports.onSessionsRevoked = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

// 내 Node 받는 쪽에 돌리기 (받는 쪽 오류는 삼킴, 알림 실패가 로그아웃·로그인을 막지 않게)
const deliver = (uuid, info) => {
    for (const listener of listeners) {
        try { listener(uuid, info); } catch { /* 위와 같음 */ }
    }
};

// 알리기: 거래 안이면 커밋 뒤에 (커밋 전에 지우면 그 틈의 확인이 옛 "살아 있음"을 다시 저장함)
// 내 Node 먼저 지우고 다른 Node에 방송 (방송은 던지지 않음, 단일 모드·Redis down이면 그냥 안 감)
exports.notifySessionsRevoked = (uuid, transaction) => {
    if (!uuid) return;
    const emit = () => {
        deliver(uuid, { remote: false });
        cluster.bus.publish(cluster.BUS_TYPES.AUTH_REVOKED, { uuid });
    };
    if (transaction && typeof transaction.afterCommit === "function") {
        transaction.afterCommit(emit);
        return;
    }
    emit();
};

// 다른 Node가 끊은 세션 받기: uuid 모양만 보고 내 Node 받는 쪽에 넘김 (다시 방송 안 함)
cluster.bus.on(cluster.BUS_TYPES.AUTH_REVOKED, (msg) => {
    if (typeof msg.uuid !== "string" || msg.uuid.length === 0 || msg.uuid.length > 64) return;
    deliver(msg.uuid, { remote: true });
});
