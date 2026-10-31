module.exports = (sequelize, DataTypes) => {
  const ExternalIdentity = sequelize.define('ExternalIdentity', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    provider: { type: DataTypes.STRING(30), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    email_snapshot: { type: DataTypes.STRING(100), allowNull: true },
  }, {
    tableName: 'external_identities',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { name: 'external_identities_provider_subject_unique', unique: true, fields: ['provider', 'subject'] },
    ],
  });

  ExternalIdentity.associate = (models) => {
    ExternalIdentity.belongsTo(models.User, { foreignKey: 'user_id', targetKey: 'uuid' });
  };

  return ExternalIdentity;
};
