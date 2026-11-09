// 세션 끊김 알림 파일, 세션을 끊은 저장소 함수가 "이 사람 세션 끊김"을 알리고 소켓 세션 확인이 받아 잠깐 저장한 결과를 지움
// session.js(로그아웃·그 사람 세션 전부 끊기)가 알리고, socket/connection/auth.js가 받음

const listeners = new Set();

// 받는 쪽 붙이기, 떼는 함수 돌려줌
exports.onSessionsRevoked = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

// 알리기: 거래 안이면 커밋 뒤에 (커밋 전에 지우면 그 틈의 확인이 옛 "살아 있음"을 다시 저장함), 받는 쪽 오류는 삼킴
exports.notifySessionsRevoked = (uuid, transaction) => {
    if (!uuid || listeners.size === 0) return;
    const emit = () => {
        for (const listener of listeners) {
            try { listener(uuid); } catch { /* 알림 실패가 로그아웃·로그인을 막지 않게 */ }
        }
    };
    if (transaction && typeof transaction.afterCommit === "function") {
        transaction.afterCommit(emit);
        return;
    }
    emit();
};
