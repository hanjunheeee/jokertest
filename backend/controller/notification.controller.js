const notificationService = require("../service/notification.service");

/**
 * F-17 알림 조회(AC-06 / A-05).
 *
 * 대상 계정은 오직 verifyToken이 확정한 req.user.uuid다 — 본문·query·헤더의 어떤 값도
 * 조회 대상을 바꾸지 못한다. 익명 요청은 라우터의 verifyToken이 먼저 401로 끊는다.
 *
 * 조회는 알림을 만들지도, 읽음으로 바꾸지도 않는다(A-04). 응답을 캐시하면 계정 전환 후
 * 이전 계정의 목록이 되살아날 수 있으므로 friend.controller.searchUsers와 같은 방식으로
 * no-store를 붙인다.
 */
exports.getNotifications = async (req, res, next) => {
    try {
        const notifications = await notificationService.listForUser(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        next(error);
    }
};

/**
 * F-17 알림 읽음 확정(AC-02).
 *
 * id와 req.user.uuid를 함께 조건으로 쓰는 것은 서비스가 담당한다 — 다른 계정의 id는
 * 404이고 어떤 행도 바뀌지 않는다. 이미 읽은 알림은 최초 read_at을 그대로 돌려준다(멱등).
 */
exports.markNotificationRead = async (req, res, next) => {
    try {
        const notification = await notificationService.markRead(req.user.uuid, req.params.id);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        next(error);
    }
};
