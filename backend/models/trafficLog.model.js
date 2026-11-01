// 요청 기록 표(traffic_logs) 모델, 주소·방식·응답 코드·걸린 시간
// models/index.js가 읽기만 함, 쓰거나 읽는 코드 없음 (요청 기록은 morgan 콘솔 로그로만 남음)
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

  // 다른 표와 관계 없음
  TrafficLog.associate = (models) => {
  };

  return TrafficLog;
};
