const express = require("express");
const router  = express.Router();

const friendController = require("../controller/friend.controller");
const { verifyToken }  = require("../middleware/auth.middleware");

router.get("/", verifyToken, friendController.getFriends);
router.get("/search", verifyToken, friendController.searchUsers);
router.get("/requests/incoming", verifyToken, friendController.getIncomingRequests);
// F-19(AC-02): 전체 수락 응답이 유실됐을 때 당사자가 결과를 되묻는 읽기 전용 경로다.
// /requests/:id 보다 먼저 선언해야 "results"가 id로 해석되지 않는다.
router.get("/requests/results", verifyToken, friendController.getRequestResults);
router.post("/requests", verifyToken, friendController.sendFriendRequest);
router.put("/requests/:id/accept", verifyToken, friendController.acceptRequest);
router.put("/requests/:id/decline", verifyToken, friendController.declineRequest);

// F-19(AC-03): 즐겨찾기는 계정 소유 서버 값이다. PUT은 원하는 true/false를 그대로 저장하는
// 멱등 계약이라(toggle 아님) 재전송이 상태를 뒤집지 않는다.
router.get("/favorites", verifyToken, friendController.getFavorites);
router.put("/favorites/:friendId", verifyToken, friendController.setFavorite);

// F-19(AC-04/AC-05): 차단 목록·차단·해제. 해제는 인증 owner의 행만 지운다.
router.get("/blocks", verifyToken, friendController.getBlocks);
router.post("/blocks", verifyToken, friendController.blockUser);
router.delete("/blocks/:targetId", verifyToken, friendController.unblockUser);

// F-19(AC-06/AC-07): 게임 초대의 생성·조회·거절. **수락은 여기 없다** — 실제 입장은 방
// registry와 소켓 채널을 함께 확정해야 하므로 소켓 경계(accept_game_invite)가 소유한다.
router.get("/invites", verifyToken, friendController.getInviteSnapshot);
router.post("/invites", verifyToken, friendController.createInvite);
router.get("/invites/:inviteId", verifyToken, friendController.getInvite);
router.post("/invites/:inviteId/decline", verifyToken, friendController.declineInvite);

module.exports = router;
