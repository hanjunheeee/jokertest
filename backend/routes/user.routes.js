// 내 정보 경로 파일, /user 아래 프로필·닉네임·비번 · 약관 재동의·탈퇴·이메일 바꾸기 · 직업 통계·순위 · 업적 · 이모티콘 팔레트
// index.js가 /user에 붙임, 전부 로그인 필요 (처리기는 controllers 여러 파일)
const express = require("express");
const router  = express.Router();

const { getMyProfile,
        updateNickname,
        updatePassword } = require("../controllers/profile.controller");
const { getMyRoleStatistics,
        getRoleRanking }  = require("../controllers/game/roleStatistics");
const { getMyAchievements } = require("../controllers/achievement.controller");
const { getEmojiPalette,
        saveEmojiPalette }  = require("../controllers/economy/emojiPalette");
const { verifyToken }    = require("../middlewares/auth.middleware");
const { getMyPendingTerms,
        agreeMyTerms }    = require("../controllers/auth/terms");
const { getMyAccount,
        withdraw,
        requestEmailChange,
        confirmEmailChange } = require("../controllers/auth/member");
const { createRateLimiter } = require("../middlewares/rateLimit.middleware");

// 이메일 바꾸기 요청 수 제한 (한 사람 기준, 서버 메모리): 번호 보내기 1시간 5번 · 확인 15분 20번
const emailChangeCodeLimit = createRateLimiter({
    windowMs: 60 * 60 * 1000, max: 5,
    keyOf: (req) => `email-change-code:${req.user.uuid}`,
    message: "인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
});
const emailChangeVerifyLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000, max: 20,
    keyOf: (req) => `email-change-verify:${req.user.uuid}`,
    message: "확인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
});
// 탈퇴 요청 수 제한: 한 사람 15분 10번 (비번 틀린 횟수 제한은 서비스 몫)
const withdrawLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000, max: 10,
    keyOf: (req) => `withdraw:${req.user.uuid}`,
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
});

router.get("/me/profile",   verifyToken, getMyProfile);
router.patch("/me/nickname", verifyToken, updateNickname);
router.patch("/me/password", verifyToken, updatePassword);

// 약관 재동의 필요 목록·재동의 (새 필수 버전이 생기면 로그인 뒤 화면이 부름)
router.get("/me/terms", verifyToken, getMyPendingTerms);
router.post("/me/terms/agree", verifyToken, agreeMyTerms);

// 회원 탈퇴 (마이페이지 비번 바꾸는 창 안), 이메일 바꾸기 (새 주소로 번호 → 확인)
router.get("/me/account", verifyToken, getMyAccount);
router.post("/me/withdraw", verifyToken, withdrawLimit, withdraw);
router.post("/me/email/code", verifyToken, emailChangeCodeLimit, requestEmailChange);
router.post("/me/email/verify", verifyToken, emailChangeVerifyLimit, confirmEmailChange);

// 순위는 남의 기록까지 보여서 /me 밖
router.get("/me/role-statistics",   verifyToken, getMyRoleStatistics);
router.get("/role-statistics/ranking", verifyToken, getRoleRanking);

router.get("/me/achievements", verifyToken, getMyAchievements);

// 이모티콘 팔레트 처리기는 경제 서비스를 써서 controllers/economy 안에 있음
router.get("/me/emoji-palette", verifyToken, getEmojiPalette);
router.put("/me/emoji-palette", verifyToken, saveEmojiPalette);

module.exports = router;
