const express = require("express");
const router  = express.Router();

const friendController = require("../controller/friend.controller");
const { verifyToken }  = require("../middleware/auth.middleware");

router.get("/", verifyToken, friendController.getFriends);
router.get("/search", verifyToken, friendController.searchUsers);
router.get("/requests/incoming", verifyToken, friendController.getIncomingRequests);
router.post("/requests", verifyToken, friendController.sendFriendRequest);
router.put("/requests/:id/accept", verifyToken, friendController.acceptRequest);
router.put("/requests/:id/decline", verifyToken, friendController.declineRequest);

module.exports = router;
