module.exports = (sequelize, DataTypes) => {
  const GameInvite = sequelize.define('GameInvite', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },

    creation_seq: { type: DataTypes.BIGINT, allowNull: false, autoIncrement: true, unique: 'game_invites_creation_seq_unique' },

    sender_id: { type: DataTypes.UUID, allowNull: false },
    receiver_id: { type: DataTypes.UUID, allowNull: false },

    room_id: { type: DataTypes.STRING(64), allowNull: false },
    room_instance_id: { type: DataTypes.STRING(64), allowNull: false },
    boot_epoch: { type: DataTypes.STRING(64), allowNull: false },

    creation_key: { type: DataTypes.STRING(120), allowNull: false },

    revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDING' },
    end_reason: { type: DataTypes.STRING(60), allowNull: true },

    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    decided_at: { type: DataTypes.DATE, allowNull: true },

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

  GameInvite.associate = (models) => {
    GameInvite.belongsTo(models.User, { as: 'InviteSender', foreignKey: 'sender_id', targetKey: 'uuid' });
    GameInvite.belongsTo(models.User, { as: 'InviteReceiver', foreignKey: 'receiver_id', targetKey: 'uuid' });
  };

  return GameInvite;
};
