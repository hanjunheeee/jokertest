'use strict';

// 지난 판 경로 파일, /admin-api/games 아래 GET /(찾기) · GET /:gameId(판 하나)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');

const controller = require('../controllers/games.controller');

const router = express.Router();

router.get('/', controller.listGames);
router.get('/:gameId', controller.getGame);

module.exports = router;
