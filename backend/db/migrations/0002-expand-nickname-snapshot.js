'use strict';

// F-01 경기 닉네임 스냅샷 확장 마이그레이션.
//
// users.nickname은 이미 50자까지 허용하지만(backend/models/user/user.model.js),
// game_result_players.nickname_snapshot은 0001 기준선 시점 그대로 30자다.
// game-core/gameSession.js의 buildGameResultRecord가 nickname_snapshot에 player.nickname을
// 잘라내지 않고 그대로 담기 때문에, 50자 닉네임을 가진 유저가 경기를 마치면 실제
// INSERT에서 MySQL의 컬럼 길이 제약에 걸려 저장이 실패한다. 이 마이그레이션은 그 컬럼을
// 50자로 넓혀 users.nickname과 동일한 상한을 갖게 한다.
//
// 재실행 시에는 현재 컬럼 길이를 먼저 확인해 이미 50자면 아무 것도 하지 않는다(멱등).
// down()은 50자를 넘는 기존 데이터가 있으면 30자로 되돌리는 것을 거부한다 — 축소는
// 곧 자름(truncate)이고, 이 슬라이스의 계획은 "50자 데이터가 생긴 뒤 30자로 축소하는
// 복구는 금지"를 명시적으로 요구한다.

const VARCHAR_LENGTH = /^varchar\((\d+)\)$/i;

const currentLength = (describedColumn) => {
    const match = VARCHAR_LENGTH.exec(String(describedColumn.type).trim());
    return match ? Number(match[1]) : null;
};

module.exports = {
    name: '0002-expand-nickname-snapshot',

    async up(queryInterface, Sequelize) {
        const table = await queryInterface.describeTable('game_result_players');
        const length = currentLength(table.nickname_snapshot);

        if (length === 50) return; // 이미 적용됨 — 재실행 시 아무 것도 하지 않는다.
        if (length !== 30) {
            throw new Error(
                `game_result_players.nickname_snapshot의 현재 길이(${length ?? table.nickname_snapshot.type})가 ` +
                `예상한 30이 아니라서 안전하게 확장할 수 없습니다. 수동으로 확인하세요.`,
            );
        }

        // 확장(30→50)은 기존 문자열을 자르지 않는다 — VARCHAR 길이 증가는 데이터 손실이 없다.
        await queryInterface.changeColumn('game_result_players', 'nickname_snapshot', {
            type: Sequelize.STRING(50),
            allowNull: false,
        });
    },

    async down(queryInterface, Sequelize) {
        const [rows] = await queryInterface.sequelize.query(
            'SELECT MAX(CHAR_LENGTH(nickname_snapshot)) AS max_len FROM game_result_players',
        );
        const maxLen = rows[0] && rows[0].max_len;
        if (maxLen != null && maxLen > 30) {
            throw new Error(
                `game_result_players에 30자를 초과하는 nickname_snapshot(최대 ${maxLen}자)이 이미 존재합니다. ` +
                `30자로 되돌리면 기존 데이터가 잘리므로 이 되돌리기를 거부합니다.`,
            );
        }

        await queryInterface.changeColumn('game_result_players', 'nickname_snapshot', {
            type: Sequelize.STRING(30),
            allowNull: false,
        });
    },

    async verify(queryInterface) {
        const table = await queryInterface.describeTable('game_result_players');
        const length = currentLength(table.nickname_snapshot);
        if (length !== 50) {
            throw new Error(`nickname_snapshot이 50자로 확장되지 않았습니다 (현재: ${length ?? table.nickname_snapshot.type})`);
        }
    },

    currentLength,
};
