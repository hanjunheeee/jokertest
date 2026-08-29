const express = require("express");
const router  = express.Router();

const { getGameResult } = require("../controller/game.controller");
const { verifyToken }   = require("../middleware/auth.middleware");

router.get("/:gameId", verifyToken, getGameResult);

module.exports = router;
