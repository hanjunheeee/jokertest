'use strict';

// 모델 묶음 파일, DB 연결 하나 만들고 models 폴더 모델을 전부 읽어 db 객체로 묶음
// 저장소·index.js·db 스크립트가 씀 (repositories/common/db.js가 그대로 다시 내보냄)
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const { buildPoolConfig } = require('../config/dbPool');

const basename = path.basename(__filename);

// 실행 환경마다 config.json 설정 고름, 없으면 development
const env = process.env.NODE_ENV || 'development';

const config = require(__dirname + '/../config/config.json')[env];

const db = {};

let sequelize;

// 연결 풀 크기: config 값 위에 DB_POOL_* 환경 변수 덮어씀
const pool = buildPoolConfig(config.pool);

// 지금 config.json은 세 환경 다 DATABASE_URL 주소로 연결함
if(config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable], { ...config, pool });
} else {
    sequelize = new Sequelize(config.database, config.username, config.password, { ...config, pool });
}

// 하위 폴더까지 돌며 모델 파일마다 정의함 (index.js·숨김 파일·시험 파일은 뺌)
const readModels = (dir) => {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);

        if (fs.statSync(fullPath).isDirectory()) {
            readModels(fullPath);
        } else if (
            file.indexOf('.') !== 0 &&
            file !== basename &&
            file.slice(-3) === '.js' &&
            file.indexOf('.test.js') === -1
        ) {
            // 파일이 돌려준 모델 하나만 db에 올림 (경제 모델 파일은 장부만 돌려줌)
            const model = require(fullPath)(sequelize, Sequelize.DataTypes);

            db[model.name] = model;
        }
    });
};

readModels(__dirname);

// 모델 다 읽은 뒤 관계 연결 (서로를 이름으로 찾기 때문)
Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

// 트랜잭션·직접 쿼리용 연결과 Op·DataTypes 꺼낼 Sequelize도 같이 내보냄
db.sequelize = sequelize;

db.Sequelize = Sequelize;

module.exports = db;
