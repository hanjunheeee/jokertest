module.exports = (sequelize, DataTypes) => {
  const SignupEmailVerification = sequelize.define('SignupEmailVerification', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(100), allowNull: false },
    purpose: { type: DataTypes.STRING(20), allowNull: false },
    generation: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    code_hash: { type: DataTypes.STRING(64), allowNull: true },
    code_expires_at: { type: DataTypes.DATE, allowNull: true },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    code_consumed_at: { type: DataTypes.DATE, allowNull: true },
    sent_at: { type: DataTypes.DATE, allowNull: true },
    proof_hash: { type: DataTypes.STRING(64), allowNull: true },
    proof_expires_at: { type: DataTypes.DATE, allowNull: true },
    proof_consumed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'signup_email_verifications',
    timestamps: false,
    indexes: [
      { name: 'signup_email_verifications_email_purpose_unique', unique: true, fields: ['email', 'purpose'] },
      { name: 'signup_email_verifications_proof_hash_unique', unique: true, fields: ['proof_hash'] },
    ],
  });

  return SignupEmailVerification;
};
