'use strict';

// 열린 방·판 경로 파일, /admin-api/live 아래 GET / 하나 (화면이 30초마다 백그라운드로 부름)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');

const controller = require('../controllers/live.controller');

const router = express.Router();

router.get('/', controller.getLive);

module.exports = router;
