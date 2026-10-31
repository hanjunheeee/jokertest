const express = require("express");
const router  = express.Router();

const notificationController = require("../controller/notification.controller");
const { verifyToken }        = require("../middleware/auth.middleware");

router.get("/", verifyToken, notificationController.getNotifications);
router.delete("/read", verifyToken, notificationController.deleteReadNotifications);
router.patch("/:id/read", verifyToken, notificationController.markNotificationRead);

module.exports = router;
