/**
 * @file GameRepository.js
 * @desc Persistence boundary for game state/event storage.
 *
 * This is intentionally only an interface-style base class. The game core does
 * not import Sequelize or SQLite, so a future SqliteGameRepository can be added
 * without coupling rule resolution to database code.
 */

class GameRepository {
  /** @param {Object} gameState */
  async saveGameState(gameState) {
    throw new Error("GameRepository.saveGameState is not implemented");
  }

  /** @param {string} gameId */
  async loadGameState(gameId) {
    throw new Error("GameRepository.loadGameState is not implemented");
  }

  /** @param {string} gameId @param {Object} event */
  async appendGameEvent(gameId, event) {
    throw new Error("GameRepository.appendGameEvent is not implemented");
  }

  /** @param {string} gameId */
  async listGameEvents(gameId) {
    throw new Error("GameRepository.listGameEvents is not implemented");
  }
}

module.exports = {
  GameRepository,
};
