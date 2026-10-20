const express = require("express");
const router  = express.Router();

const notificationController = require("../controller/notification.controller");
const { verifyToken }        = require("../middleware/auth.middleware");

// friend.routes.js와 같은 인증 미들웨어를 쓴다 — 익명 요청은 여기서 401로 끊기고,
// 컨트롤러는 항상 확정된 req.user.uuid만 본다(A-05).
router.get("/", verifyToken, notificationController.getNotifications);
router.delete("/read", verifyToken, notificationController.deleteReadNotifications);
router.patch("/:id/read", verifyToken, notificationController.markNotificationRead);

module.exports = router;
