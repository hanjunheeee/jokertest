'use strict';

// 통계 경로 파일, /admin-api/stats 아래 GET / 하나 (한국 날짜 기간 → 날짜별 숫자)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');

const controller = require('../controllers/stats.controller');

const router = express.Router();

router.get('/', controller.getStats);

module.exports = router;
