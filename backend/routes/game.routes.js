const express = require("express");
const router  = express.Router();

const { getGameResult } = require("../controllers/game.controller");
const { verifyToken }   = require("../middlewares/auth.middleware");

router.get("/:gameId", verifyToken, getGameResult);

module.exports = router;
