module.exports = (sequelize, DataTypes) => {
  const AccountFindRequest = sequelize.define('AccountFindRequest', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING(100), allowNull: false },
    request_type: { type: DataTypes.STRING(30) },
    ip_address: { type: DataTypes.STRING(45) },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, {
    tableName: 'account_find_requests',
    timestamps: false,
  });

  AccountFindRequest.associate = (models) => {};

  return AccountFindRequest;
};