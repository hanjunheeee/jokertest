module.exports = (sequelize, DataTypes) => {
  const TrafficLog = sequelize.define('TrafficLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    url: { type: DataTypes.TEXT, allowNull: false },
    method: { type: DataTypes.STRING(10), allowNull: false },
    response_status: { type: DataTypes.INTEGER },
    ip_address: { type: DataTypes.STRING(45) },
    response_time_ms: { type: DataTypes.INTEGER },
    accessed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'traffic_logs',
    timestamps: false,
  });

  TrafficLog.associate = (models) => {
    // 다른 모델과 관계 없는 독립적인 통계용 로그 테이블
  };

  return TrafficLog;
};
