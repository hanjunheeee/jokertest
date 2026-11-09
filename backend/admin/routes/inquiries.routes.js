'use strict';

// 관리자 문의 경로 파일, /admin-api/inquiries 아래 목록·하나 보기·답 달기
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠)
const express = require('express');

const controller = require('../controllers/inquiries.controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.detail);
router.post('/:id/replies', controller.reply);

module.exports = router;
