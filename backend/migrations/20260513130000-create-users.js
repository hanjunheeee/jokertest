/**
 * Sequelize 마이그레이션 예시 파일.
 *
 * 현재 서버는 models/index.js의 모델 정의와 sequelize.sync로 테이블을 맞추고 있어
 * 이 마이그레이션은 별도 CLI 실행 시에만 사용됩니다.
 */
"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  /**
   * users 테이블과 uuid 기본키 제약조건을 생성합니다.
   * @param {import('sequelize').QueryInterface} queryInterface
   * @param {import('sequelize').Sequelize} Sequelize
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      uuid: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      login_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      nickname: {
        type: Sequelize.STRING(50),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      role: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "USER",
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "ACTIVE",
      },
      profile_image_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      email_verified: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      failed_login_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      locked_until: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      last_login_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal(
          "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
        ),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      Field: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      Field2: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      Field3: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addConstraint("users", {
      fields: ["uuid"],
      type: "PRIMARY KEY",
      name: "PK_USERS",
    });
  },

  /**
   * users 테이블을 삭제합니다. (up의 롤백)
   * @param {import('sequelize').QueryInterface} queryInterface
   * @returns {Promise<void>}
   */
  async down(queryInterface) {
    await queryInterface.dropTable("users");
  },
};
