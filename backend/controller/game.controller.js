const gameResultRepository = require("../repositories/gameResult.repositories");

// 저장된 전적 한 건을 그대로 돌려주는 읽기 전용 엔드포인트입니다. 진행 중인 세션의
// 스냅샷(get_session_snapshot)과 달리 비밀 정보 게이트가 없습니다 — 이미 끝난 판이라
// role/team은 전원에게 공개된 사실이고, 응답에는 DB에 저장된 값 외에 아무 것도 없습니다.
exports.getGameResult = async (req, res, next) => {
    try {
        const gameId = typeof req.params.gameId === "string" ? req.params.gameId.trim() : "";
        if (!gameId) {
            return res.status(400).json({ success: false, message: "게임 id가 필요합니다." });
        }

        const result = await gameResultRepository.findGameResultById(gameId);
        if (!result) {
            return res.status(404).json({ success: false, message: "게임 기록을 찾을 수 없습니다." });
        }

        res.status(200).json({
            success: true,
            data: {
                game_id: result.id,
                room_id: result.room_id,
                winner: result.winner,
                win_reason: result.win_reason,
                started_at: result.started_at,
                ended_at: result.ended_at,
                day_index: result.day_index,
                player_count: result.player_count,
                settings: result.settings,
                completed: result.completed,
                players: result.players.map((player) => ({
                    uuid: player.user_id,
                    nickname_snapshot: player.nickname_snapshot,
                    role: player.role,
                    team: player.team,
                    won: player.won,
                    is_alive: player.is_alive,
                    death_reason: player.death_reason,
                })),
            },
        });
    } catch (error) {
        next(error);
    }
};
