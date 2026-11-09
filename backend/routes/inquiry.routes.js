// 플레이어 문의 경로 파일, /inquiries 아래 문의 쓰기·내 목록·상세 (전부 플레이어 로그인)
// index.js가 /inquiries에 붙임, 처리기는 controllers/inquiry.controller.js (너무 자주 쓰기 막기는 서비스가 DB로 셈)
const express = require("express");
const router  = express.Router();

const { verifyToken } = require("../middlewares/auth.middleware");
const inquiryController = require("../controllers/inquiry.controller");

router.post("/", verifyToken, inquiryController.createInquiry);
router.get("/", verifyToken, inquiryController.listInquiries);
router.get("/:id", verifyToken, inquiryController.getInquiry);

module.exports = router;
