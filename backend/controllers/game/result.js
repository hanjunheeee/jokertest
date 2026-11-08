// 판 결과 컨트롤러 파일, 끝난 판 기록 하나를 응답 모양으로
// routes/game.routes.js가 GET /game/:gameId에 부름 (기록 읽기는 services/game/record/queries.js)
const gameRecordQueries = require("../../services/game/record/queries");

// 판 id로 기록 찾아 판 정보 + 사람마다 역할·승패·생존 응답 (그 판 참가자만)
exports.getGameResult = async (req, res, next) => {
    try {
        // 공백뿐인 id는 400
        const gameId = typeof req.params.gameId === "string" ? req.params.gameId.trim() : "";
        if (!gameId) {
            return res.status(400).json({ success: false, message: "게임 id가 필요합니다." });
        }

        const result = await gameRecordQueries.findGameResultById(gameId);
        // 그 판에 낀 사람만 봄, 남의 판은 없는 판과 같은 404 (판 id만 바꿔 남의 판 직업·승패 보기 막기)
        const isParticipant = Array.isArray(result?.players)
            && result.players.some((player) => player.user_id === req.user?.uuid);
        if (!result || !isParticipant) {
            return res.status(404).json({ success: false, message: "게임 기록을 찾을 수 없습니다." });
        }

        // 응답 칸 이름은 DB처럼 snake_case (players의 user_id만 uuid로)
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
