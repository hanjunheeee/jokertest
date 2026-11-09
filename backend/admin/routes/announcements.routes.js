'use strict';

// 공지 경로 파일, /admin-api/announcements 아래 보내기 하나 (보낸 이력은 처리 이력 화면 /audit-logs?kind=announce)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');

const controller = require('../controllers/announcements.controller');

const router = express.Router();

router.post('/', controller.send);

module.exports = router;
