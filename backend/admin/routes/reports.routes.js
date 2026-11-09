'use strict';

// 신고 처리 경로 파일, /admin-api/reports 아래 목록·상세·처리(정지)·기각
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠), Express 5라 async 오류는 오류 처리기로 감
const express = require('express');
const controller = require('../controllers/reports.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.detail);
router.post('/:id/resolve', controller.resolve);
router.post('/:id/dismiss', controller.dismiss);

module.exports = router;
