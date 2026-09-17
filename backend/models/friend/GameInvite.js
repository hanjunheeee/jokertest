// F-19(AC-06/AC-07) 게임 초대 원본.
//
// 한 행이 "발송 계정이 수신 계정에게 특정 방 인스턴스로 보낸 초대 하나"다. 서버가 정하는
// 값만 저장한다 — 클라이언트가 보낸 발송자·수신자·방 코드는 권한 근거가 되지 않는다(A-05).
//
// 세 가지 사실을 **서로 다른 컬럼**으로 분리해 둔 것이 AC-06 입장 계약의 핵심이다(A-10):
//   1) status/decided_at  — 역사적 수락 결정. 첫 트랜잭션에서 선형화된다.
//   2) entry_outcome      — 역사적 publication 영수증. 두 번째 finalization 트랜잭션이 쓴다.
//   3) 현재 canonical membership — 이 테이블에 없다. matchmaking.js의 gameRooms/playerRoom이
//      유일한 출처다.
// 성공 입장은 (2)의 PUBLISHED와 (3)이 **함께** 확인될 때만 인정한다. ACCEPTED만 보고
// 대기방으로 이동하거나, 과거 PUBLISHED만 보고 방을 복원하지 않는다.
//
// room_instance_id/boot_epoch는 "같은 문자열 방 코드"의 재사용을 막는다(A-11). 서버가
// 재시작하면 boot_epoch가 달라지므로 옛 초대의 입장 재실행이 허용되지 않는다.
module.exports = (sequelize, DataTypes) => {
  const GameInvite = sequelize.define('GameInvite', {
    // 서버가 만드는 UUID. 알림 source_key·SFX eventId·REST 경로에 그대로 노출되므로 순번을
    // 쓰지 않는다(notifications의 id와 같은 이유).
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },

    // 수신자별 "이보다 큰 것만 신규"를 판정하는 서버 생성 순번이다(A-09). 종료된 행까지
    // 포함한 수신자 전체 최댓값이 snapshot 커서가 된다 — PENDING만의 최댓값을 쓰면 이미
    // 끝난 과거 초대가 새 사건으로 오인된다.
    //
    // 전송 시 정밀도를 잃지 않도록 서비스 계층이 문자열로 직렬화한다.
    creation_seq: { type: DataTypes.BIGINT, allowNull: false, autoIncrement: true, unique: 'game_invites_creation_seq_unique' },

    sender_id: { type: DataTypes.UUID, allowNull: false },
    receiver_id: { type: DataTypes.UUID, allowNull: false },

    // 발송 시점 발송자가 실제로 소속돼 있던 방. 초대 payload에는 수락 전 방 코드를 넣지
    // 않으므로(AC-06) 코드 자체는 저장하지 않는다.
    room_id: { type: DataTypes.STRING(64), allowNull: false },
    // 같은 room_id 문자열이 재사용되더라도 다른 인스턴스임을 구분하는 값.
    room_instance_id: { type: DataTypes.STRING(64), allowNull: false },
    // 이 프로세스 기동 식별자. 재시작을 넘는 입장 재실행을 막는다.
    boot_epoch: { type: DataTypes.STRING(64), allowNull: false },

    // 발송 계정에 귀속된 멱등 생성 키. 같은 키의 재시도는 기존 행을 돌려주고 신규 수신
    // 사건을 재발행하지 않는다. 같은 키에 다른 대상·방을 보내면 충돌로 거부한다.
    creation_key: { type: DataTypes.STRING(120), allowNull: false },

    // 상태가 바뀔 때마다 오르는 단조 증가값. 지연 도착한 오래된 사건이 최신 terminal
    // 상태를 되살리지 못하게 하는 병합 기준이다(A-06).
    revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

    // PENDING | ACCEPTED | DECLINED | EXPIRED | CANCELLED
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    // 종료 사유를 보존한다(차단 무효화·방 삭제·시작·발송자 이탈 등).
    end_reason: { type: DataTypes.STRING(60), allowNull: true },

    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    // 만료는 서버 시각으로만 판단한다.
    expires_at: { type: DataTypes.DATE, allowNull: false },
    decided_at: { type: DataTypes.DATE, allowNull: true },

    // 수락 시도 하나를 식별한다. 늦게 끝난 옛 시도가 새 소속을 지우지 못하게 하는 소유 표식.
    attempt_id: { type: DataTypes.STRING(64), allowNull: true },
    // null | UNCONFIRMED | PUBLISHED | INTERRUPTED
    entry_outcome: { type: DataTypes.STRING(20), allowNull: true },
  }, {
    tableName: 'game_invites',
    timestamps: false,
    indexes: [
      { unique: true, name: 'game_invites_sender_key_unique', fields: ['sender_id', 'creation_key'] },
      { name: 'game_invites_receiver_seq_idx', fields: ['receiver_id', 'creation_seq'] },
      { name: 'game_invites_receiver_status_idx', fields: ['receiver_id', 'status'] },
      { name: 'game_invites_room_idx', fields: ['room_id'] },
    ],
  });

  GameInvite.associate = (models) => {
    GameInvite.belongsTo(models.User, { as: 'InviteSender', foreignKey: 'sender_id', targetKey: 'uuid' });
    GameInvite.belongsTo(models.User, { as: 'InviteReceiver', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return GameInvite;
};
