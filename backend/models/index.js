'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const { buildPoolConfig } = require('../config/dbPool');

const basename = path.basename(__filename);

const env = process.env.NODE_ENV || 'development';

const config = require(__dirname + '/../config/config.json')[env];

const db = {};

let sequelize;

const pool = buildPoolConfig(config.pool);

if(config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable], { ...config, pool });
} else {
    sequelize = new Sequelize(config.database, config.username, config.password, { ...config, pool });
}

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
            const model = require(fullPath)(sequelize, Sequelize.DataTypes);

            db[model.name] = model;
        }
    });
};

readModels(__dirname);

Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;

db.Sequelize = Sequelize;

module.exports = db;
