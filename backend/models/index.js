'use strict';

// 필요한 모듈 불러오기
// 파일 시스템(fs), 경로(path) 제어 모듈과 Sequelize 라이브러리를 가져옵니다.
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');

// 현재 파일명(index.js)을 추출하고, 실행 환경(development, production 등)을 판별합니다.
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';

// 환경 설정 불러오기
// config.json 파일에서 현재 실행 환경(env)에 맞는 DB 접속 정보만 쏙 빼옵니다.
const config = require(__dirname + '/../config/config.json')[env];
const db = {};

// Sequelize 인스턴스 생성 (DB 연결)
// 환경 변수나 config에 정의된 정보(DB명, 유저 아이디, 비밀번호 등)를 바탕으로 실제 DB와 연결 객체를 만듭니다.
let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

// 모델 파일 자동 로딩 및 초기화
// 현재 폴더(models) 내의 모든 파일을 스캔하여 모델들을 DB 객체에 한 번에 등록합니다.
fs
  .readdirSync(__dirname)
  .filter(file => {
    // 숨김 파일이나 현재 파일(index.js), 테스트 파일(.test.js)을 제외한 순수 .js 파일만 골라냅니다.
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    // 골라낸 모델 파일을 하나씩 실행하여 만든 객체를 db 딕셔너리에 담아줍니다. (예: db.User = User모델)
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// 모델 간의 관계(Associations) 설정
// 등록된 모든 모델을 한 바퀴 돌면서, 내부에 associate 함수(관계 설정)가 있으면 실행해 줍니다.
// (우리가 모델 파일에서 User.hasMany, belongsTo 등을 썼던 부분이 여기서 일괄적으로 묶입니다.)
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// 전역 사용을 위한 객체 할당
// 나중에 다른 파일에서 트랜잭션(transaction)이나 Sequelize 기본 기능(Op 연산자 등)을 쓰기 편하도록,
// 연결된 인스턴스(sequelize)와 라이브러리 자체(Sequelize)를 db 객체에 끼워 넣습니다.
db.sequelize = sequelize;
db.Sequelize = Sequelize;

// 모듈 내보내기
module.exports = db;