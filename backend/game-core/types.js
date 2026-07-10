/**
 * @file types.js
 * @desc In-game domain constants shared by the core rule modules.
 *
 * These values are intentionally plain strings so Socket.io payloads, tests,
 * and future persistence adapters can serialize them without translation.
 */

const ROLES = Object.freeze({
  JOKER: "JOKER",
  DOCTOR: "DOCTOR",
  GUARD: "GUARD",
  WITCH_HUNTER: "WITCH_HUNTER",
  NOBLE: "NOBLE",
});

const TEAMS = Object.freeze({
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
});

const GAME_PHASES = Object.freeze({
  DAY: "DAY",
  TRIBUNAL: "TRIBUNAL",
  NIGHT: "NIGHT",
  ENDED: "ENDED",
});

const DEATH_REASONS = Object.freeze({
  EXECUTED: "EXECUTED",
  ASSASSINATED: "ASSASSINATED",
  DISCONNECTED: "DISCONNECTED",
  UNKNOWN: "UNKNOWN",
});

const TRIBUNAL_VOTES = Object.freeze({
  APPROVE: "APPROVE",
  REJECT: "REJECT",
});

const NIGHT_ACTION_TYPES = Object.freeze({
  PROTECT: "PROTECT",
  ASSASSINATE: "ASSASSINATE",
  INVESTIGATE: "INVESTIGATE",
  CONFIRM: "CONFIRM",
  SKIP: "SKIP",
});

const CHAT_CHANNELS = Object.freeze({
  PUBLIC: "PUBLIC",
  JOKER_NIGHT: "JOKER_NIGHT",
});

const WIN_REASONS = Object.freeze({
  ALL_JOKERS_ELIMINATED: "ALL_JOKERS_ELIMINATED",
  JOKERS_REACHED_PARITY: "JOKERS_REACHED_PARITY",
});

const EVENT_VISIBILITY = Object.freeze({
  PUBLIC: "PUBLIC",
  PRIVATE: "PRIVATE",
  TEAM_JOKER: "TEAM_JOKER",
  SYSTEM: "SYSTEM",
});

const GAME_EVENT_TYPES = Object.freeze({
  GAME_CREATED: "GAME_CREATED",
  PHASE_CHANGED: "PHASE_CHANGED",
  DAY_VOTE_CAST: "DAY_VOTE_CAST",
  DAY_VOTE_RESOLVED: "DAY_VOTE_RESOLVED",
  DAY_VOTE_NO_CANDIDATE: "DAY_VOTE_NO_CANDIDATE",
  GUILLOTINE_BROKEN: "GUILLOTINE_BROKEN",
  TRIBUNAL_STARTED: "TRIBUNAL_STARTED",
  TRIBUNAL_VOTE_CAST: "TRIBUNAL_VOTE_CAST",
  PLAYER_EXECUTED: "PLAYER_EXECUTED",
  EXECUTION_REJECTED: "EXECUTION_REJECTED",
  NIGHT_ACTION_SUBMITTED: "NIGHT_ACTION_SUBMITTED",
  NIGHT_ACTION_SKIPPED: "NIGHT_ACTION_SKIPPED",
  PROTECTION_APPLIED: "PROTECTION_APPLIED",
  JOKER_TARGET_SELECTED: "JOKER_TARGET_SELECTED",
  ASSASSINATION_BLOCKED: "ASSASSINATION_BLOCKED",
  PLAYER_ASSASSINATED: "PLAYER_ASSASSINATED",
  INVESTIGATION_RESULT: "INVESTIGATION_RESULT",
  CONFIRM_RESULT: "CONFIRM_RESULT",
  PLAYER_DISCONNECTED: "PLAYER_DISCONNECTED",
  WIN_DECLARED: "WIN_DECLARED",
  CHAT_SENT: "CHAT_SENT",
});

/**
 * Returns the team for a role. Keeping this mapping centralized prevents UI,
 * tests, and future persistence code from inventing separate role rules.
 * @param {string} role
 * @returns {string}
 */
function getTeamForRole(role) {
  if (role === ROLES.JOKER) return TEAMS.JOKER;
  if (Object.values(ROLES).includes(role)) return TEAMS.CITIZEN;
  throw new Error(`Unsupported role: ${role}`);
}

/**
 * @typedef {Object} PlayerState
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {string} team
 * @property {boolean} alive
 * @property {boolean} connected
 * @property {string=} deathReason
 */

/**
 * @typedef {Object} GameEvent
 * @property {string} id
 * @property {string} gameId
 * @property {string} type
 * @property {string} phase
 * @property {number} day
 * @property {string} createdAt
 * @property {string=} actorId
 * @property {string=} targetId
 * @property {string=} visibility
 * @property {string=} message
 * @property {Object=} payload
 */

module.exports = {
  ROLES,
  TEAMS,
  GAME_PHASES,
  DEATH_REASONS,
  TRIBUNAL_VOTES,
  NIGHT_ACTION_TYPES,
  CHAT_CHANNELS,
  WIN_REASONS,
  EVENT_VISIBILITY,
  GAME_EVENT_TYPES,
  getTeamForRole,
};
