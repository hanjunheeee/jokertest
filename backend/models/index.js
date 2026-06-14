'use strict';

// 필요한 모듈 불러오기
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');

// 현재 파일명(index.js)을 추출하고, 실행 환경을 판별합니다.
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';

// 환경 설정 불러오기
const config = require(__dirname + '/../config/config.json')[env];
const db = {};

// Sequelize 인스턴스 생성 (DB 연결)
let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

// 하위 폴더를 계속 파고들며(재귀) .js 파일을 찾아내는 함수를 만듭니다.
const readModels = (dir) => {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    
    // 1. 만약 파일이 아니라 '폴더'라면? 그 안으로 한 번 더 파고듭니다.
    if (fs.statSync(fullPath).isDirectory()) {
      readModels(fullPath);
    } 
    // 2. 폴더가 아니고, 순수 .js 모델 파일이라면? DB 객체에 등록합니다.
    else if (
      file.indexOf('.') !== 0 && 
      file !== basename && 
      file.slice(-3) === '.js' && 
      file.indexOf('.test.js') === -1
    ) {
      const model = require(fullPath)(sequelize, Sequelize.DataTypes);
      db[model.name] = model;
    }
  });
};

// 현재 디렉토리(__dirname)를 시작점으로 스캔 함수 실행!
readModels(__dirname);

// 모델 간의 관계(Associations) 설정
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// 전역 사용을 위한 객체 할당
db.sequelize = sequelize;
db.Sequelize = Sequelize;

// 모듈 내보내기
module.exports = db;