// 게임 초대 표(game_invites) 모델, 초대 한 번에 한 줄 (대기 → 결정 → 입장 결과까지)
// models/index.js가 읽음, 게임 초대 저장소가 씀
module.exports = (sequelize, DataTypes) => {
  const GameInvite = sequelize.define('GameInvite', {
    // 서비스가 만든 uuid
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },

    // DB가 매기는 순번, 받은 초대 줄 세우기·가장 새 초대 찾기용
    creation_seq: { type: DataTypes.BIGINT, allowNull: false, autoIncrement: true, unique: 'game_invites_creation_seq_unique' },

    sender_id: { type: DataTypes.UUID, allowNull: false },
    receiver_id: { type: DataTypes.UUID, allowNull: false },

    // 초대한 방 + 그 방이 만들어진 회차 + 서버 부팅 회차 (방이 다시 생기거나 서버가 재시작하면 옛 초대는 안 맞음)
    room_id: { type: DataTypes.STRING(64), allowNull: false },
    room_instance_id: { type: DataTypes.STRING(64), allowNull: false },
    boot_epoch: { type: DataTypes.STRING(64), allowNull: false },

    // 같은 요청 두 번 와도 초대 하나만 (보낸 사람마다 유일)
    creation_key: { type: DataTypes.STRING(120), allowNull: false },

    // 바뀔 때마다 1 늘림, 화면이 옛 상태로 덮어쓰지 않게
    revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

    // PENDING → ACCEPTED·DECLINED·EXPIRED·CANCELLED, 끝난 이유는 end_reason
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    end_reason: { type: DataTypes.STRING(60), allowNull: true },

    // 만든 지 3분 지나면 만료 (expires_at), 결정한 시각은 decided_at
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    decided_at: { type: DataTypes.DATE, allowNull: true },

    // 수락한 그 입장 시도 id + 입장 결과 (UNCONFIRMED → PUBLISHED·INTERRUPTED)
    attempt_id: { type: DataTypes.STRING(64), allowNull: true },
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

  // 초대 목록에 보낸 사람 닉네임 붙일 때 InviteSender로 씀
  GameInvite.associate = (models) => {
    GameInvite.belongsTo(models.User, { as: 'InviteSender', foreignKey: 'sender_id', targetKey: 'uuid' });
    GameInvite.belongsTo(models.User, { as: 'InviteReceiver', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return GameInvite;
};
