"use strict";

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      uuid: {
        type: DataTypes.INTEGER,
        primaryKey: true,
      },
      loginId: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: "login_id",
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: "password_hash",
      },
      nickname: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "USER",
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      profileImageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "profile_image_url",
      },
      emailVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: "email_verified",
      },
      failedLoginCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "failed_login_count",
      },
      lockedUntil: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "locked_until",
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "last_login_at",
      },
      Field: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      Field2: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      Field3: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "users",
      underscored: true,
      timestamps: true,
      paranoid: true,
    }
  );

  return User;
};
