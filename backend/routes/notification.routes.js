// 알림 경로 파일, /notifications 아래 목록 · 읽은 알림 지우기 · 읽음 표시
// index.js가 /notifications에 붙임, 전부 로그인 필요 (처리기는 controllers/notification.controller.js)
const express = require("express");
const router  = express.Router();

const notificationController = require("../controllers/notification.controller");
const { verifyToken }        = require("../middlewares/auth.middleware");

router.get("/", verifyToken, notificationController.getNotifications);
router.delete("/read", verifyToken, notificationController.deleteReadNotifications);
router.patch("/:id/read", verifyToken, notificationController.markNotificationRead);

module.exports = router;
