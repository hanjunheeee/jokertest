// 판 결과 경로 파일, /game/:gameId 끝난 판 기록 하나 읽기
// index.js가 /game에 붙임, 로그인 필요 (처리기는 controllers/game/result.js)
const express = require("express");
const router  = express.Router();

const { getGameResult } = require("../controllers/game/result");
const { verifyToken }   = require("../middlewares/auth.middleware");

router.get("/:gameId", verifyToken, getGameResult);

module.exports = router;
