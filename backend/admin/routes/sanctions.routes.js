'use strict';

// 제재 경로 파일, /admin-api/members/:uuid 아래 강제 접속 종료·정지·기간 바꾸기·해제
// admin/index.js가 붙임 (로그인·쓰기 확인은 admin/index.js가 앞에 붙여 둠), 처리는 sanctions.controller.js
const express = require('express');
const sanctions = require('../controllers/sanctions.controller');

// uuid를 받으려고 mergeParams
const router = express.Router({ mergeParams: true });

router.post('/force-disconnect', sanctions.forceDisconnect);
router.post('/bans', sanctions.ban);
router.patch('/bans/:banId', sanctions.updateBan);
router.post('/unban', sanctions.unban);

module.exports = router;
