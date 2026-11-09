'use strict';

// 회원 찾기·상태 경로 파일, /admin-api/members 아래 찾기·상세·이메일 전체 보기
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠), 처리는 members.controller.js
const express = require('express');
const members = require('../controllers/members.controller');

const router = express.Router();

router.get('/', members.search);
router.get('/:uuid', members.detail);
router.post('/:uuid/reveal-email', members.revealEmail);

module.exports = router;
