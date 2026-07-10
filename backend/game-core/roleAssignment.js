/**
 * @file roleAssignment.js
 * @desc Supported player-count role composition and seeded role assignment.
 */

const { DEFAULT_GAME_CONFIG } = require("./config");
const { normalizeRng } = require("./rng");
const { getTeamForRole } = require("./types");

/**
 * Returns the configured role list for a player count.
 * @param {number} playerCount
 * @param {Object} [config]
 */
function getRoleComposition(playerCount, config = DEFAULT_GAME_CONFIG) {
  const roles = config.roleSetups[playerCount];
  if (!roles) throw new Error(`Unsupported player count: ${playerCount}`);
  return [...roles];
}

/**
 * Assigns shuffled roles to players with an injected RNG. The input list is not
 * mutated, which keeps tests and future room-state adapters predictable.
 * @param {Object[]} players
 * @param {{ rng?: Object|string|number, config?: Object }} [options]
 */
function assignRoles(players, options = {}) {
  const config = options.config ?? DEFAULT_GAME_CONFIG;
  const roles = getRoleComposition(players.length, config);
  const rng = normalizeRng(options.rng);
  const shuffledRoles = rng.shuffle(roles);

  return players.map((player, index) => {
    const role = shuffledRoles[index];
    return {
      ...player,
      role,
      team: getTeamForRole(role),
      alive: player.alive ?? true,
      connected: player.connected ?? true,
    };
  });
}

module.exports = {
  getRoleComposition,
  assignRoles,
};
