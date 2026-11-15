'use strict';

// 판 설정 값 경로 파일, /admin-api/game-settings 아래 보기·바꾸기 (판마다 주는 골드)
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠), Express 5라 async 오류는 오류 처리기로 감
const express = require('express');
const controller = require('../controllers/gameSettings.controller');

const router = express.Router();

router.get('/', controller.get);
router.put('/', controller.update);

module.exports = router;
