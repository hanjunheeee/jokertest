// 쿠폰 사용 표(coupon_redemptions) 모델, 누가 어느 쿠폰을 언제 (한 사람 한 쿠폰 한 줄)
// models/index.js가 읽음, 쿠폰 사용 서비스가 씀, id는 장부 참조 id (마이그레이션 0024)
module.exports = (sequelize, DataTypes) => {
  const CouponRedemption = sequelize.define('CouponRedemption', {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    coupon_id: { type: DataTypes.INTEGER, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    redeemed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'coupon_redemptions',
    timestamps: false,
    indexes: [
      { unique: true, fields: ['coupon_id', 'user_id'], name: 'coupon_redemptions_coupon_user_unique' },
      { fields: ['user_id'], name: 'coupon_redemptions_user_idx' },
    ],
  });

  CouponRedemption.associate = (models) => {
    CouponRedemption.belongsTo(models.Coupon, { foreignKey: 'coupon_id', targetKey: 'id' });
    CouponRedemption.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return CouponRedemption;
};
