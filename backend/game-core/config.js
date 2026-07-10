/**
 * @file config.js
 * @desc Tunable rule values for [The Joker] game core.
 *
 * Balance choices live here so future rule changes do not require editing the
 * vote, phase, or night-action resolvers.
 */

const { ROLES } = require("./types");

const DEFAULT_GAME_CONFIG = Object.freeze({
  supportedPlayerCounts: [5, 6, 8, 10],
  roleSetups: Object.freeze({
    5: [ROLES.JOKER, ROLES.DOCTOR, ROLES.NOBLE, ROLES.NOBLE, ROLES.NOBLE],
    6: [
      ROLES.JOKER,
      ROLES.GUARD,
      ROLES.DOCTOR,
      ROLES.NOBLE,
      ROLES.NOBLE,
      ROLES.NOBLE,
    ],
    8: [
      ROLES.JOKER,
      ROLES.JOKER,
      ROLES.GUARD,
      ROLES.DOCTOR,
      ROLES.WITCH_HUNTER,
      ROLES.NOBLE,
      ROLES.NOBLE,
      ROLES.NOBLE,
    ],
    10: [
      ROLES.JOKER,
      ROLES.JOKER,
      ROLES.GUARD,
      ROLES.DOCTOR,
      ROLES.WITCH_HUNTER,
      ROLES.NOBLE,
      ROLES.NOBLE,
      ROLES.NOBLE,
      ROLES.NOBLE,
      ROLES.NOBLE,
    ],
  }),
  allowSelfDayVote: false,
  allowTribunalCandidateVote: false,
  allowDoctorSelfProtect: false,
  allowPublicChatDuringTribunal: false,
  dayDurationSeconds: Object.freeze({
    firstDay: 150,
    minimum: 60,
    perDeathReduction: 10,
    perDayReduction: 5,
  }),
  nightDurationSeconds: 40,
});

const DEVELOPMENT_GAME_CONFIG_OVERRIDE = Object.freeze({
  supportedPlayerCounts: [1, 2, 5, 6, 8, 10],
  roleSetups: Object.freeze({
    // 개발 샌드박스 전용 구성입니다. 공식 밸런스에는 포함하지 않습니다.
    1: [ROLES.JOKER],
    2: [ROLES.JOKER, ROLES.DOCTOR],
  }),
});

function mergePlainObject(base, override = {}) {
  const output = { ...base };

  Object.entries(override).forEach(([key, value]) => {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      output[key] = mergePlainObject(base[key], value);
      return;
    }

    output[key] = value;
  });

  return output;
}

/**
 * Builds a config object for one game. The result is mutable by design only at
 * the GameState boundary; rule modules should treat it as read-only.
 * @param {Object} [override]
 * @returns {Object}
 */
function resolveGameConfig(override = {}) {
  return mergePlainObject(DEFAULT_GAME_CONFIG, override);
}

/**
 * Builds a development-only config that accepts one/two-player rooms.
 * Production game sessions should continue to use DEFAULT_GAME_CONFIG.
 * @param {Object} [override]
 */
function resolveDevelopmentGameConfig(override = {}) {
  return resolveGameConfig(mergePlainObject(DEVELOPMENT_GAME_CONFIG_OVERRIDE, override));
}

/**
 * Calculates the current daytime limit. The exact balance is still a planning
 * assumption, so the formula depends only on config values.
 * @param {number} dayIndex
 * @param {number} aliveCount
 * @param {number} initialPlayerCount
 * @param {Object} [config]
 * @returns {number}
 */
function calculateDayDuration(
  dayIndex,
  aliveCount,
  initialPlayerCount,
  config = DEFAULT_GAME_CONFIG,
) {
  const durationConfig = config.dayDurationSeconds;
  if (dayIndex <= 1) return durationConfig.firstDay;

  const deaths = Math.max(0, initialPlayerCount - aliveCount);
  const reduction =
    deaths * durationConfig.perDeathReduction +
    Math.max(0, dayIndex - 1) * durationConfig.perDayReduction;

  return Math.max(durationConfig.minimum, durationConfig.firstDay - reduction);
}

module.exports = {
  DEFAULT_GAME_CONFIG,
  DEVELOPMENT_GAME_CONFIG_OVERRIDE,
  resolveGameConfig,
  resolveDevelopmentGameConfig,
  calculateDayDuration,
};
