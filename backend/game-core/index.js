/**
 * @file index.js
 * @desc Public entry point for the game core harness.
 */

module.exports = {
  ...require("./types"),
  ...require("./config"),
  ...require("./rng"),
  ...require("./clock"),
  ...require("./events"),
  ...require("./roleAssignment"),
  ...require("./gameState"),
  ...require("./phaseMachine"),
  ...require("./voting"),
  ...require("./tribunal"),
  ...require("./nightActions"),
  ...require("./winConditions"),
  ...require("./chatRules"),
  ...require("./disconnects"),
};
