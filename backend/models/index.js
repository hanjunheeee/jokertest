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

// 커넥션 풀 기본값입니다. Sequelize의 암묵적 기본값에 기대지 않고 네 값을 여기서 모두
// 명시합니다 — 이렇게 해야 서버가 어떤 풀로 뜨는지 코드만 읽고 확정할 수 있습니다.
// 연결 실패 시 여기서도 index.js에서도 재시도하지 않습니다. 재시도는 기동 실패를
// 숨기기만 하므로, 실패는 그대로 드러내고 프로세스 관리자에게 판단을 맡깁니다.
const DEFAULT_POOL = {
    max:     10,    // 동시에 열어 둘 수 있는 커넥션의 최대 개수
    min:     0,     // 요청이 없을 때도 유지할 커넥션의 최소 개수
    idle:    10000, // 이 시간(ms) 동안 쓰이지 않은 커넥션은 닫습니다
    acquire: 30000, // 이 시간(ms) 안에 커넥션을 얻지 못하면 에러를 냅니다
};

// 환경변수 값은 언제나 문자열이라 ''·'abc'·'-1'·'3.5' 같은 값이 들어올 수 있습니다.
// 유효한 양의 정수일 때만 받아들이고 아니면 undefined를 돌려줘, 잘못된 환경변수가
// 기본값을 깨뜨리지 않게 합니다.
// 참고: 0은 받지 않지만 min의 기본값이 이미 0이라 DB_POOL_MIN=0은 결과가 같습니다.
const toPositiveInt = (raw) => {
    if (typeof raw !== 'string' || raw.trim() === '') return undefined;

    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) return undefined;

    return parsed;
};

// 기본값 → config.json의 pool → 환경변수 순으로 덮어써서 최종 풀 설정을 만듭니다.
// 환경변수는 값이 유효할 때만 반영되므로 반환값의 네 키는 항상 유효한 값을 갖습니다.
const buildPoolConfig = (configPool = {}, env = process.env) => {
    const pool = { ...DEFAULT_POOL, ...configPool };

    const overrides = {
        max:     toPositiveInt(env.DB_POOL_MAX),
        min:     toPositiveInt(env.DB_POOL_MIN),
        idle:    toPositiveInt(env.DB_POOL_IDLE),
        acquire: toPositiveInt(env.DB_POOL_ACQUIRE),
    };

    for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined) pool[key] = value;
    }

    return pool;
};

let sequelize;

// 두 분기가 같은 풀을 쓰도록 Sequelize 생성 전에 한 번만 계산합니다.
const pool = buildPoolConfig(config.pool);

// config에 use_env_variable이 있으면 .env의 DATABASE_URL　같은 값을 사용해 DB에 연결합니다.
if(config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable], { ...config, pool });
} else {
    // use_env_variable이 없으면 database, username, password　값을 직접 사용해 DB에 연결합니다.
    sequelize = new Sequelize(config.database, config.username, config.password, { ...config, pool });
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

// 풀 설정 계산만 따로 검증할 수 있도록 함께 내보냅니다. 모델 등록(associate)이 모두
// 끝난 뒤에 붙이므로 모델 키를 순회하는 위 로직에는 영향이 없습니다.
db.buildPoolConfig = buildPoolConfig;

// 완성된 db 객체를 다른 파일에서 require("./models")로 사용할 수 있게 내보냅니다.
module.exports = db;
