module.exports = (sequelize, DataTypes) => {
  const SocialSignupIntent = sequelize.define('SocialSignupIntent', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    intent_token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    provider: { type: DataTypes.STRING(30), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    email: { type: DataTypes.STRING(100), allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    consumed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'social_signup_intents',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  return SocialSignupIntent;
};
