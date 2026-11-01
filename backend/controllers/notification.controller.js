// 알림 컨트롤러 파일, 내 알림 목록 · 읽음 표시 · 읽은 알림 지우기 응답
// routes/notification.routes.js가 부름, 응답은 전부 캐시 금지 (읽음 상태가 자주 바뀜)
const notificationService = require("../services/notification");

// 내 알림 목록
exports.getNotifications = async (req, res, next) => {
    try {
        const notifications = await notificationService.listForUser(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        next(error);
    }
};

// 알림 하나 읽음 표시 (내 알림인지는 서비스가 봄)
exports.markNotificationRead = async (req, res, next) => {
    try {
        const notification = await notificationService.markRead(req.user.uuid, req.params.id);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        next(error);
    }
};

// 읽은 알림 한꺼번에 지우기
exports.deleteReadNotifications = async (req, res, next) => {
    try {
        const result = await notificationService.deleteReadForUser(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};
