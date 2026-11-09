'use strict';

// 금지어 경로 파일, /admin-api/banned-words 아래 목록·넣기·켜고 끄기
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠), Express 5라 async 오류는 오류 처리기로 감
const express = require('express');
const controller = require('../controllers/bannedWords.controller');

const router = express.Router();

router.get('/', controller.list);
router.post('/', controller.add);
router.patch('/:id', controller.toggle);

module.exports = router;
