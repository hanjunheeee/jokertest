// 소켓 알림 준비 사건 파일, 화면이 알림 받을 준비 되면 시스템 환영 알림 만들기
// socket.js 연결 처리기가 부름, 알림 서비스는 사건 받을 때 늦게 불러옴 (불러오다 실패해도 연결은 안 깨짐)
const { onlineUsers } = require("../emitter");

// 옛 소켓이면 STALE_SOCKET, 서비스 못 불러오면 UNAVAILABLE, 만들기 실패면 FAILED로 답함
// ack가 던져도 삼킴 (화면 쪽 오류로 서버 처리 안 깨지게)
function registerNotificationHandlers(socket, uuid) {
    socket.on("notifications_ready", (_payload, ack) => {
        const respond = (result) => {
            if (typeof ack === "function") {
                try { ack(result); } catch { /* ack가 던져도 알림 처리는 그대로 끝냄 */ }
            }
        };

        if (socket.data?.user?.uuid !== uuid || onlineUsers.get(uuid) !== socket.id) {
            respond({ ok: false, reason: "STALE_SOCKET" });
            return;
        }

        let notificationService;
        try {
            notificationService = require("../../services/notification");
        } catch (err) {
            console.error("\x1b[31m[알림 서비스 로드 실패]\x1b[0m", err);
            respond({ ok: false, reason: "UNAVAILABLE" });
            return;
        }

        notificationService.ensureSystemWelcome(uuid).then(
            (result) => respond({ ok: true, created: result.created === true }),
            (err) => {
                console.error("\x1b[31m[시스템 알림 생산 실패]\x1b[0m", err);
                respond({ ok: false, reason: "FAILED" });
            },
        );
    });
}

module.exports = {
    registerNotificationHandlers,
};
