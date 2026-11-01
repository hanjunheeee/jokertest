// 가입 이메일 인증 표(signup_email_verifications) 모델, 이메일·목적마다 한 줄 (인증번호 → 가입 증명)
// models/index.js가 읽음, 가입 이메일 인증 저장소가 잠가 읽고 바꿈
module.exports = (sequelize, DataTypes) => {
  const SignupEmailVerification = sequelize.define('SignupEmailVerification', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(100), allowNull: false },
    // 지금은 SIGNUP 하나
    purpose: { type: DataTypes.STRING(20), allowNull: false },
    // 다시 보낼 때마다 1 늘림, 해시에 섞어서 옛 번호·옛 증명은 안 맞게 함
    generation: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // 인증번호는 원문 없이 해시만
    code_hash: { type: DataTypes.STRING(64), allowNull: true },
    code_expires_at: { type: DataTypes.DATE, allowNull: true },
    // 틀린 횟수, 한도 넘으면 새로 받기 전까지 거절
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    code_consumed_at: { type: DataTypes.DATE, allowNull: true },
    // 다시 보내기 대기 시간 계산용
    sent_at: { type: DataTypes.DATE, allowNull: true },
    // 번호 맞히면 주는 가입 증명의 해시, 가입할 때 한 번 쓰고 끝
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
