// 소켓 알림 준비 사건 파일, 화면이 알림 받을 준비 되면 시스템 환영 알림 만들기
// socket.js 연결 처리기가 부름, 알림 서비스는 사건 받을 때 늦게 불러옴 (불러오다 실패해도 연결은 안 깨짐)
const { onlineUsers } = require("../emitter");

// 알림 준비 사건 등록: 화면 준비 신호 오면 환영 알림 만들고 결과 답함
// 답 까닭: 옛 소켓 STALE_SOCKET, 서비스 못 불러옴 UNAVAILABLE, 만들기 실패 FAILED
function registerNotificationHandlers(socket, uuid) {
    socket.on("notifications_ready", (_payload, ack) => {
        // ack 있을 때만 답, ack가 던져도 삼킴 (화면 쪽 오류로 서버 처리 안 깨지게)
        const respond = (result) => {
            if (typeof ack === "function") {
                try { ack(result); } catch { /* ack가 던져도 알림 처리는 그대로 끝냄 */ }
            }
        };

        // 이 계정의 지금 소켓일 때만 (밀려난 옛 탭이 만들기 막기)
        if (socket.data?.user?.uuid !== uuid || onlineUsers.get(uuid) !== socket.id) {
            respond({ ok: false, reason: "STALE_SOCKET" });
            return;
        }

        // 사건 받을 때 불러옴, 실패하면 답만 하고 끝 (연결은 그대로)
        let notificationService;
        try {
            notificationService = require("../../services/notification");
        } catch (err) {
            console.error("\x1b[31m[알림 서비스 로드 실패]\x1b[0m", err);
            respond({ ok: false, reason: "UNAVAILABLE" });
            return;
        }

        // 환영 알림은 계정마다 한 번만 생김 (연결마다 불려도), created로 새로 만들었는지 알림
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
