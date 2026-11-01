const express = require("express");
const router  = express.Router();

const notificationController = require("../controllers/notification.controller");
const { verifyToken }        = require("../middlewares/auth.middleware");

router.get("/", verifyToken, notificationController.getNotifications);
router.delete("/read", verifyToken, notificationController.deleteReadNotifications);
router.patch("/:id/read", verifyToken, notificationController.markNotificationRead);

module.exports = router;
