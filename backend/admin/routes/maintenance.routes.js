'use strict';

// 점검 경로 파일, /admin-api/maintenance 아래 보기·저장
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠), Express 5라 async 오류는 오류 처리기로 감
const express = require('express');
const controller = require('../controllers/maintenance.controller');

const router = express.Router();

router.get('/', controller.get);
router.put('/', controller.put);

module.exports = router;
