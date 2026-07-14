'use strict';

// Node.js 기본 모듈들을 불러옵니다.
const fs = require('fs'); // 파일/폴더를 읽기 위한 모듈
const path = require('path'); // 경로를 안전하게 조합하기 위한 모듈
const Sequelize = require('sequelize'); // Sequelize　라이브러리
const process = require('process'); // 환경변수(process.env)를 사용하기 위한 모듈

// 현재 파일 이름(index.js)를 가져옵니다.
// 모델 파일을 읽을 때 자기 자신은 제외하기 위해 사용합니다.
const basename = path.basename(__filename);

// NODE_ENV가 있으면 그 값을 쓰고, 없으면 development 환경을 기본값으로 사용합니다.
const env = process.env.NODE_ENV || 'development';

// config.js에서 현재 환경(development/test/production)에 맞는 설정만 꺼냅니다.
const config = require(__dirname + '/../config/config.json')[env];

// 모델들과 Sequelize 객체를 담아 export할 빈 객체
const db = {};

let sequelize;

// config에 use_env_variable이 있으면 .env의 DATABASE_URL　같은 값을 사용해 DB에 연결합니다.
if(config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
    // use_env_variable이 없으면 database, username, password　값을 직접 사용해 DB에 연결합니다.
    sequelize = new Sequelize(config.database, config.username, config.password, config);
}

// 모델을 도메인별 하위 폴더(auth/, user/ 등)에 나눠 담을 거라
// sequelize-cli 기본 스캔(현재 폴더만 읽음) 대신 하위 폴더까지 재귀적으로 뒤지는 로더가 필요합니다.
const readModels = (dir) => {
    // dir 폴더 안의 파일/폴더 목록을 읽어서 하나씩 처리합니다.
    fs.readdirSync(dir).forEach(file => {
        // 현재 파일/폴더의 전체 경로를 만듭니다.
        const fullPath = path.join(dir, file);

        // 현재 항목이 폴더라면 그 폴더 안도 다시 읽습니다.
        if (fs.statSync(fullPath).isDirectory()) {
            readModels(fullPath);
        } else if (
            // 숨김 파일이 아니고
            file.indexOf('.') !== 0 &&
            // 현재 index.js 파일이 아니고
            file !== basename &&
            // .js파일이고
            file.slice(-3) === '.js' &&
            // 테스트 파일이 아니면
            file.indexOf('.test.js') === -1
        ) {
            // 모델 파일을 require해서 Sequelize 모델로 초기화합니다.
            const model = require(fullPath)(sequelize, Sequelize.DataTypes);

            // db 객체에 모델 이름을 key로 저장합니다.
            db[model.name] = model;
        }
    });
};

// 현재 models　폴더부터 모델 파일들을 읽기 시작합니다.
readModels(__dirname);

// 각 모델에 associate 함수가 있으면 실행합니다.
// associate는 모델 간 관계(User.hasMany, Post.belongsTo　등)를 설정할 때 사용합니다.
Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

// DB　연결 객체를 db에 담습니다.
db.sequelize = sequelize;

// Sequelize 라이브러리 자체도 db에 담아 다른 곳에서 쓸 수 있게 합니다.
db.Sequelize = Sequelize;

// 완성된 db 객체를 다른 파일에서 require("./models")로 사용할 수 있게 내보냅니다.
module.exports = db;
