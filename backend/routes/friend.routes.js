// 친구 경로 파일, /friends 아래 친구·신청·즐겨찾기·차단·게임 초대 경로
// index.js가 /friends에 붙임, 전부 로그인 필요 (처리기는 controllers/friend.controller.js)
const express = require("express");
const router  = express.Router();

const friendController = require("../controllers/friend.controller");
const { verifyToken }  = require("../middlewares/auth.middleware");

// 친구 목록·사람 찾기·친구 신청
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

// 게임 초대 목록·보내기·하나 보기·거절 (수락은 방 입장이 걸려 socket accept_game_invite 쪽)
router.get("/invites", verifyToken, friendController.getInviteSnapshot);
router.post("/invites", verifyToken, friendController.createInvite);
router.get("/invites/:inviteId", verifyToken, friendController.getInvite);
router.post("/invites/:inviteId/decline", verifyToken, friendController.declineInvite);

module.exports = router;
