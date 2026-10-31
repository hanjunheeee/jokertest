const notificationService = require("../service/notification.service");

exports.getNotifications = async (req, res, next) => {
    try {
        const notifications = await notificationService.listForUser(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        next(error);
    }
};

exports.markNotificationRead = async (req, res, next) => {
    try {
        const notification = await notificationService.markRead(req.user.uuid, req.params.id);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: notification });
    } catch (error) {
        next(error);
    }
};

exports.deleteReadNotifications = async (req, res, next) => {
    try {
        const result = await notificationService.deleteReadForUser(req.user.uuid);
        res.set('Cache-Control', 'no-store');
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
};
