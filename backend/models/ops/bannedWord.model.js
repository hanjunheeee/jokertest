// 금지어 표(banned_words) 모델, 단어·사용 여부 (관리자 서버가 넣고 게임 서버는 읽기만)
// models/index.js가 읽음, 금지어 캐시가 켜진 단어만 읽음 (마이그레이션 0024)
module.exports = (sequelize, DataTypes) => {
  const BannedWord = sequelize.define('BannedWord', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    word: { type: DataTypes.STRING(100), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'banned_words',
    timestamps: false,
    indexes: [{ unique: true, fields: ['word'], name: 'banned_words_word_unique' }],
  });
  return BannedWord;
};
