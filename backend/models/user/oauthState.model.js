module.exports = (sequelize, DataTypes) => {
  const OAuthState = sequelize.define('OAuthState', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    state_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    purpose: { type: DataTypes.STRING(20), allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: true },
    session_id: { type: DataTypes.STRING(255), allowNull: true },
    browser_fingerprint_hash: { type: DataTypes.STRING(64), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    consumed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'oauth_states',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  return OAuthState;
};
