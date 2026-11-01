const express = require("express");
const router  = express.Router();

const friendController = require("../controllers/friend.controller");
const { verifyToken }  = require("../middlewares/auth.middleware");

router.get("/", verifyToken, friendController.getFriends);
router.get("/search", verifyToken, friendController.searchUsers);
router.get("/requests/incoming", verifyToken, friendController.getIncomingRequests);
router.get("/requests/results", verifyToken, friendController.getRequestResults);
router.post("/requests", verifyToken, friendController.sendFriendRequest);
router.put("/requests/:id/accept", verifyToken, friendController.acceptRequest);
router.put("/requests/:id/decline", verifyToken, friendController.declineRequest);

router.get("/favorites", verifyToken, friendController.getFavorites);
router.put("/favorites/:friendId", verifyToken, friendController.setFavorite);

router.get("/blocks", verifyToken, friendController.getBlocks);
router.post("/blocks", verifyToken, friendController.blockUser);
router.delete("/blocks/:targetId", verifyToken, friendController.unblockUser);

router.get("/invites", verifyToken, friendController.getInviteSnapshot);
router.post("/invites", verifyToken, friendController.createInvite);
router.get("/invites/:inviteId", verifyToken, friendController.getInvite);
router.post("/invites/:inviteId/decline", verifyToken, friendController.declineInvite);

module.exports = router;
