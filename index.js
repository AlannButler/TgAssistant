require("dotenv").config();
const TelegramBot = require('node-telegram-bot-api');
const connect = require('./db/connect');
const registerEventCreate = require('./events/eventCreate');

connect(process.env.MONGO_URI);

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

registerEventCreate(bot);

module.exports = bot;