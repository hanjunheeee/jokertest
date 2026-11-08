// 쿠폰 표(coupons) 모델, 코드·보상·사용 가능 횟수·기간·사용 여부
// models/index.js가 읽음, 쿠폰 사용 서비스가 잠가 읽고 쓴 횟수 늘림 (마이그레이션 0024)
module.exports = (sequelize, DataTypes) => {
  const Coupon = sequelize.define('Coupon', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(40), allowNull: false },
    // GOLD·DIAMOND
    reward_type: { type: DataTypes.STRING(20), allowNull: false },
    reward_amount: { type: DataTypes.INTEGER, allowNull: false },
    // null이면 횟수 제한 없음
    max_uses: { type: DataTypes.INTEGER, allowNull: true },
    used_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    starts_at: { type: DataTypes.DATE, allowNull: true },
    ends_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by_admin_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'coupons',
    timestamps: false,
    indexes: [{ unique: true, fields: ['code'], name: 'coupons_code_unique' }],
  });

  Coupon.associate = (models) => {
    Coupon.hasMany(models.CouponRedemption, { foreignKey: 'coupon_id', sourceKey: 'id' });
  };

  return Coupon;
};
