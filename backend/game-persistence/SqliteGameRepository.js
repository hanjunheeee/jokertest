/**
 * @file SqliteGameRepository.js
 * @desc SQLite adapter for game state snapshots and event history.
 *
 * The core rule modules do not import this file. Socket/session code depends
 * on the GameRepository boundary so SQLite can later be replaced by Sequelize
 * or another storage layer without rewriting game rules.
 */

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3");
const { GameRepository } = require("./GameRepository");

const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "game.sqlite");

function serialize(value) {
  return JSON.stringify(value ?? null);
}

function deserialize(text) {
  return text ? JSON.parse(text) : null;
}

class SqliteGameRepository extends GameRepository {
  /**
   * @param {{ dbPath?: string }} [options]
   */
  constructor(options = {}) {
    super();
    this.dbPath = options.dbPath ?? process.env.GAME_SQLITE_PATH ?? DEFAULT_DB_PATH;
    this.db = null;
    this.ready = null;
  }

  async init() {
    if (this.ready) return this.ready;

    this.ready = new Promise((resolve, reject) => {
      if (this.dbPath !== ":memory:") {
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        this.run("PRAGMA foreign_keys = ON")
          .then(() => this.createTables())
          .then(resolve)
          .catch(reject);
      });
    });

    return this.ready;
  }

  async createTables() {
    await this.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        phase TEXT NOT NULL,
        day_index INTEGER NOT NULL,
        winner TEXT,
        win_reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS players (
        game_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        team TEXT NOT NULL,
        alive INTEGER NOT NULL,
        connected INTEGER NOT NULL,
        death_reason TEXT,
        PRIMARY KEY (game_id, player_id),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS game_events (
        game_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        type TEXT NOT NULL,
        phase TEXT NOT NULL,
        day INTEGER NOT NULL,
        actor_id TEXT,
        target_id TEXT,
        visibility TEXT,
        message TEXT,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (game_id, event_id),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS day_votes (
        game_id TEXT NOT NULL,
        voter_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (game_id, voter_id),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tribunal_votes (
        game_id TEXT NOT NULL,
        voter_id TEXT NOT NULL,
        vote TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (game_id, voter_id),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS night_actions (
        game_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        type TEXT NOT NULL,
        target_id TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (game_id, actor_id),
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS game_snapshots (
        game_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );
    `);
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function onRun(error) {
        if (error) {
          reject(error);
          return;
        }
        resolve(this);
      });
    });
  }

  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (error, row) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(row ?? null);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (error, rows) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(rows);
      });
    });
  }

  async saveGameState(gameState) {
    await this.init();
    const updatedAt = new Date().toISOString();
    const winResult = gameState.winResult ?? {};

    await this.run("BEGIN TRANSACTION");
    try {
      await this.run(
        `INSERT INTO games (id, phase, day_index, winner, win_reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           phase = excluded.phase,
           day_index = excluded.day_index,
           winner = excluded.winner,
           win_reason = excluded.win_reason,
           updated_at = excluded.updated_at`,
        [
          gameState.id,
          gameState.phase,
          gameState.dayIndex,
          winResult.winner ?? null,
          winResult.reason ?? null,
          updatedAt,
        ],
      );

      await this.replacePlayers(gameState);
      await this.replaceDayVotes(gameState, updatedAt);
      await this.replaceTribunalVotes(gameState, updatedAt);
      await this.replaceNightActions(gameState, updatedAt);
      await this.saveSnapshot(gameState, updatedAt);
      await this.insertEvents(gameState.events);
      await this.run("COMMIT");
    } catch (error) {
      await this.run("ROLLBACK").catch(() => {});
      throw error;
    }
  }

  async replacePlayers(gameState) {
    await this.run("DELETE FROM players WHERE game_id = ?", [gameState.id]);
    for (const player of gameState.players) {
      await this.run(
        `INSERT INTO players
          (game_id, player_id, name, role, team, alive, connected, death_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          gameState.id,
          player.id,
          player.name,
          player.role,
          player.team,
          player.alive ? 1 : 0,
          player.connected ? 1 : 0,
          player.deathReason ?? null,
        ],
      );
    }
  }

  async replaceDayVotes(gameState, updatedAt) {
    await this.run("DELETE FROM day_votes WHERE game_id = ?", [gameState.id]);
    for (const [voterId, targetId] of Object.entries(gameState.dayVotes.votesByVoter)) {
      await this.run(
        "INSERT INTO day_votes (game_id, voter_id, target_id, updated_at) VALUES (?, ?, ?, ?)",
        [gameState.id, voterId, targetId, updatedAt],
      );
    }
  }

  async replaceTribunalVotes(gameState, updatedAt) {
    await this.run("DELETE FROM tribunal_votes WHERE game_id = ?", [gameState.id]);
    for (const [voterId, vote] of Object.entries(gameState.tribunal.votesByVoter)) {
      await this.run(
        "INSERT INTO tribunal_votes (game_id, voter_id, vote, updated_at) VALUES (?, ?, ?, ?)",
        [gameState.id, voterId, vote, updatedAt],
      );
    }
  }

  async replaceNightActions(gameState, updatedAt) {
    await this.run("DELETE FROM night_actions WHERE game_id = ?", [gameState.id]);
    for (const [actorId, action] of Object.entries(gameState.nightActions.actionsByActor)) {
      await this.run(
        "INSERT INTO night_actions (game_id, actor_id, type, target_id, updated_at) VALUES (?, ?, ?, ?, ?)",
        [gameState.id, actorId, action.type, action.targetId ?? null, updatedAt],
      );
    }
  }

  async saveSnapshot(gameState, updatedAt) {
    await this.run(
      `INSERT INTO game_snapshots (game_id, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(game_id) DO UPDATE SET
         state_json = excluded.state_json,
         updated_at = excluded.updated_at`,
      [gameState.id, serialize(gameState), updatedAt],
    );
  }

  async insertEvents(events) {
    for (const [sequence, event] of events.entries()) {
      await this.appendGameEvent(event.gameId, event, sequence + 1);
    }
  }

  async loadGameState(gameId) {
    await this.init();
    const row = await this.get(
      "SELECT state_json FROM game_snapshots WHERE game_id = ?",
      [gameId],
    );
    return deserialize(row?.state_json);
  }

  async appendGameEvent(gameId, event, sequence = null) {
    await this.init();
    await this.run(
      `INSERT OR IGNORE INTO game_events
        (game_id, event_id, sequence, type, phase, day, actor_id, target_id,
         visibility, message, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gameId,
        event.id,
        sequence ?? 0,
        event.type,
        event.phase,
        event.day,
        event.actorId ?? null,
        event.targetId ?? null,
        event.visibility ?? null,
        event.message ?? null,
        serialize(event.payload),
        event.createdAt,
      ],
    );
  }

  async listGameEvents(gameId) {
    await this.init();
    const rows = await this.all(
      "SELECT * FROM game_events WHERE game_id = ? ORDER BY sequence ASC",
      [gameId],
    );
    return rows.map((row) => ({
      id: row.event_id,
      gameId: row.game_id,
      type: row.type,
      phase: row.phase,
      day: row.day,
      actorId: row.actor_id ?? undefined,
      targetId: row.target_id ?? undefined,
      visibility: row.visibility ?? undefined,
      message: row.message ?? undefined,
      payload: deserialize(row.payload_json) ?? undefined,
      createdAt: row.created_at,
    }));
  }

  async close() {
    if (!this.db) return;
    await new Promise((resolve, reject) => {
      this.db.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.db = null;
    this.ready = null;
  }
}

module.exports = {
  SqliteGameRepository,
  DEFAULT_DB_PATH,
};
