const express = require("express");
const router  = express.Router();

const { getGameResult } = require("../controllers/game/result");
const { verifyToken }   = require("../middlewares/auth.middleware");

router.get("/:gameId", verifyToken, getGameResult);

module.exports = router;
