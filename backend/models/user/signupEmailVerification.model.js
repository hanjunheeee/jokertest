module.exports = (sequelize, DataTypes) => {
  // F-31a: 이메일별 SIGNUP 인증 현재 상태를 한 행으로 관리한다(email+purpose 유일 제약).
  // 원문 인증번호·원문 가입 증명 컬럼은 존재하지 않는다 — code_hash/proof_hash는 이메일·
  // 목적·generation을 결합한 HMAC만 저장한다(AC-06). generation은 재발송마다 올라가
  // 이전 번호·증명을 자연스럽게 무효화한다(같은 해시 입력을 다시 만들 수 없다).
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
