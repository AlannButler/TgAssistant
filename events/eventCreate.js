require('dotenv').config();
const { default: mongoose } = require("mongoose");
const { TestsSchema } = require("../db/model");
const fs = require('fs');
const https = require('https');
const path = require('path');
const youtubedl = require('youtube-dl-exec')
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GENAI);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

// In-memory user state to track progress (use a database for persistence if necessary)
const userStates = {};
const menuOptions = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '📜 Tests', callback_data: 'tests' }],
            [{ text: '🧲 Download', callback_data: 'download' }],
            [{ text: '📄 Document', callback_data: 'document' }],
            [{ text: '📚 AI', callback_data: 'ai' }],
            [{ text: '🔍 Reputation', callback_data: 'reputation' }],
        ]
    },
    parse_mode: "Markdown"
};
const waitingAiPrompt = {};
const waitingMessage = {};

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = (bot) => {
    bot.on('callback_query', async (callbackQuery) => {
        if (callbackQuery.from.id !== 1944820935) return;

        const message = callbackQuery.message;
        const data = callbackQuery.data;

        await bot.deleteMessage(message.chat.id, message.message_id);

        switch (data) {
            case "menu":
                await bot.sendMessage(msg.chat.id, '*Choose an option:*', menuOptions);
                break;
            case "stop_ai":
                waitingAiPrompt[message.chat.id] = null;
                await bot.sendMessage(message.chat.id, 'AI stopped', { reply_markup: { remove_keyboard: true } });
                break;
            case "document":
                await bot.sendMessage(message.chat.id, 
                    "Write your prompt for document",
                    { reply_markup: { remove_keyboard: true } }
                )
                waitingAiPrompt[message.chat.id] = {state: true, document: true};
                break;
            case "ai":
                await bot.sendMessage(message.chat.id,
                    "Write your prompt for AI", 
                    { reply_markup: { remove_keyboard: true } }
                );
                waitingAiPrompt[message.chat.id] = {state: true, document: false};
                break;
            case "reputation":
                await bot.sendMessage(message.chat.id, "Enter your current reputation string:");
                waitingMessage[message.chat.id] = { state: "reputation" };
                break;
            case "youtube":
                await bot.sendMessage(message.chat.id, 'Please enter the URL of the Youtube video you want to download:', { reply_markup: { remove_keyboard: true } });
                bot.on("message", async (msg) => {
                    const chatId = msg.chat.id;
                    const text = msg.text;

                    youtubedl(text, {
                        dumpSingleJson: true,
                        addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
                        // listFormats: true
                    }).then(async (output) => {
                        const formats = output.formats.filter(format => 
                            !format.format.includes("audio only") && 
                            !format.format.includes("storyboard") &&
                            !format.url.startsWith("https://manifest.googlevideo.com"));
                        fs.writeFileSync('test.json', JSON.stringify(formats, null, 2)); 
                        const bestVideo = formats.reduce((max, item) => item.quality > max.quality ? item : max, formats[0]);
                        console.log(bestVideo)

                        if (bestVideo.url) {
                            fs.writeFileSync('output.json', JSON.stringify(output, null, 2));
                            const videoPath = path.join(__dirname, 'downloads', 'video.mp4'); // Change the file name as needed
    
                            try {
                                await bot.sendMessage(chatId, `Downloading video... Please wait.\n\nApproximate time: ${Math.ceil(bestVideo.filesize / 1024 / 1024 / 100)} minutes.\nFile size: ${Math.ceil(bestVideo.filesize / 1024 / 1024)} MB`);
                                const response = await axios({
                                    method: 'GET',
                                    url: bestVideo.url,
                                    responseType: 'stream'
                                });
    
                                const writer = fs.createWriteStream(videoPath);
    
                                response.data.pipe(writer);
    
                                writer.on('finish', () => {
                                    console.log('Video downloaded successfully');
                                    bot.sendVideo(chatId, videoPath);
                                });
    
                                writer.on('error', (err) => {
                                    console.error('Error downloading video:', err);
                                    bot.sendMessage(chatId, 'Error downloading video');
                                });
                            } catch (error) {
                                console.error('Error fetching video:', error);
                                bot.sendMessage(chatId, 'Error fetching video');
                            }
                        } else {
                            bot.sendMessage(chatId, 'Couldn\'t find videoUrl');
                        }
                    })
                });
                break;
            case "download":
                await bot.sendMessage(message.chat.id,
                    `Choose the platform you want to download the resource from:`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "Youtube", callback_data: "youtube" }],
                                [{ text: "Instagram", callback_data: "instagram" }],
                                [{ text: "TikTok", callback_data: "tiktok" }],
                                [{ text: "Pinterest", callback_data: "pinterest" }],
                            ]
                        }
                    }
                )
                break;
            case 'tests':
                const tests = await TestsSchema.find();
                const testsOptions = {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Create a test', callback_data: 'create_test' }],
                        ]
                    },
                    parse_mode: "Markdown"
                }

                if (tests.length > 0) {
                    tests.map(item => testsOptions.reply_markup.inline_keyboard.push([{ text: item.name, callback_data: `test_${item._id}` }]));
                }

                await bot.sendMessage(message.chat.id, '*Choose an option:*', testsOptions);
                break;

            case 'create_test':
                userStates[message.chat.id] = { stage: 'title', data: { name: "", description: "", questions: [] } };
                await bot.sendMessage(message.chat.id, 'Please enter the tests:\nFormat:\nTitle\nDescription\nQuestion\nAnswer(true/false)\n\nQuestions and answers are limitless and should be separated by a new line.\nExample:\nTest1\nThis is a test\nWhat is 1+1?\n2(true)\n3(false)\n4(false)\nWhat is 2+1?\n4(false)\n3(true)', { reply_markup: { remove_keyboard: true } });

                bot.on("message", async (msg) => {
                    var text;
                    if (msg.document) {
                        const fileId = msg.document.file_id;
                        const fileName = msg.document.file_name;
                    
                        console.log(`Received file: ${fileName}`);
                        console.log(`File ID: ${fileId}`);
                        const downloadFolder = path.join(__dirname, 'downloads');

                        // Ensure the download directory exists
                        if (!fs.existsSync(downloadFolder)) {
                            fs.mkdirSync(downloadFolder, { recursive: true });
                        }
                        // Download the file
                        try {
                            const file = await bot.getFile(fileId);
                            if (!file) {
                                console.error('No file info returned.');
                                return;
                            }
                
                            const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
                            const filePath = path.join(downloadFolder, fileName);
                
                            console.log(`File URL: ${fileUrl}`);
                
                            await new Promise((resolve, reject) => {
                                https.get(fileUrl, (response) => {
                                    if (response.statusCode !== 200) {
                                        console.error(`Failed to download file. Status code: ${response.statusCode}`);
                                        reject(new Error('Failed to download file'));
                                        return;
                                    }
                
                                    const fileStream = fs.createWriteStream(filePath);
                                    response.pipe(fileStream);
                
                                    fileStream.on('finish', () => {
                                        console.log(`File saved to ${filePath}`);
                
                                        // After saving, read the file (assuming it's a text file)
                                        if (fileName.endsWith('.txt')) {
                                            fs.readFile(filePath, 'utf8', (err, data) => {
                                                if (err) {
                                                    console.error('Error reading the file:', err);
                                                    reject(err);
                                                } else {
                                                    text = data;
                                                    resolve();
                                                }
                                            });
                                        } else {
                                            resolve();
                                        }
                                    });

                                    fileStream.on('error', (err) => {
                                        console.error('Error saving the file:', err);
                                        reject(err);
                                    });
                                }).on('error', (err) => {
                                    console.error('Error downloading file:', err);
                                    reject(err);
                                });
                            });
                        } catch (err) {
                            console.error('Error getting file:', err);
                        }
                    } else {
                        text = msg.text;
                    }

                    const chatId = msg.chat.id;
                    const currentState = userStates[chatId];

                    if (!currentState) return;

                    if (currentState.stage === 'title') {
                        const [name, description, ...rawQuestions] = text.split('\n');
                        
                        currentState.data.name = name;
                        currentState.data.description = description;
                    
                        // Parse questions and answers
                        const questions = [];
                        let currentQuestion = null;
                    
                        rawQuestions.forEach(line => {
                            if (!line.includes('(')) {
                                // This line is a question
                                if (currentQuestion) {
                                    // Push the previous question before starting a new one
                                    questions.push(currentQuestion);
                                }
                                currentQuestion = { question: line, answers: [] };
                            } else if (currentQuestion) {
                                // This line is an answer
                                const [answerText, isCorrect] = line.split('(');
                                currentQuestion.answers.push({
                                    answer: answerText.trim(),
                                    isCorrect: isCorrect.replace(')', '').trim() === 'true'
                                });
                            }
                        });
                    
                        // Push the last question if exists
                        if (currentQuestion) {
                            questions.push(currentQuestion);
                        }
                    
                        currentState.data.questions = questions;
                        currentState.stage = 'done';
                    
                        await bot.sendMessage(chatId, 'Test created successfully!');
                        const newTest = new TestsSchema(currentState.data);
                        await newTest.save();
                    }                    
                }) 
                break;
        }
        if (data.startsWith('test_') || data.startsWith("question_")) {
            const [_, testId, answer] = data.split('_');
            if (data.startsWith('question_')) {
                const isCorrect = answer === 'correct';
                await bot.sendMessage(message.chat.id, isCorrect ? '*[✅] Correct!*' : '*[❌] Incorrect!*', { parse_mode: 'Markdown' });
            }
            const test = await TestsSchema.findById(new mongoose.Types.ObjectId(testId));
            if (test) {
                const randomQuestion = test.questions[Math.floor(Math.random() * test.questions.length)];
                const shuffledAnswers = shuffle(randomQuestion.answers);
                const options = {
                    reply_markup: {
                        inline_keyboard: shuffledAnswers.map(answer => [{ text: answer.answer, callback_data: answer.isCorrect ? `question_${testId}_correct` : `question_${testId}_incorrect` }]).concat([[{ text: 'Exit', callback_data: 'menu' }]])
                    }
                };
    
                await bot.sendMessage(message.chat.id, randomQuestion.question, options);
            }
        }
    });

    bot.onText(/\/start/, async (msg) => {
        await bot.sendMessage(msg.chat.id, '*Choose an option:*', menuOptions);
    });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        const userId = msg.from.id;

        if (userId !== 1944820935) return;

        if (text === "test_mongoose") {
            const tests = await TestsSchema.find({ "questions.answers": { $size: 0 } });
            console.log(tests)
        }
        if (waitingMessage[chatId].state === "reputation") {
            const { days, totalNeeded } = calculateReputationDays(text);
            await bot.sendMessage(chatId, `You need ${totalNeeded} reputation points to reach the next level. At the current rate of 2100 reputation points per day, you will reach the next level in ${days} days.`);
            waitingMessage[chatId] = null;
        }
        if (waitingAiPrompt[chatId] && waitingAiPrompt[chatId].state) {
            console.log("Got AI prompt:", text);
            var textForAI = msg.text;
            var prompt;
            if (waitingAiPrompt[chatId].document) {
                prompt = "Given data from you, will be automatically generated into a document. So don't use any formatting. Prompt:\n" + textForAI;
            } else {
                prompt = "Don't use any formatting. Prompt:\n" + textForAI;
            }
            
            console.log("Generating response...");
            const result = await model.generateContent(prompt);
            console.log(result.response.text());
            
            if (waitingAiPrompt[chatId].document) {
                console.log("Creating a document...")
                const fileName = 'document.docx';
                const filePath = path.join(__dirname, 'downloads', fileName);
                
                fs.writeFile(filePath, result.response.text(), async (err) => {
                    if (err) {
                        console.error('Error writing document:', err);
                        await bot.sendMessage(chatId, 'Error creating document');
                    } else {
                        await bot.sendDocument(chatId, filePath);
                    }
                });
                waitingAiPrompt[chatId] = null;
            } else {
                console.log("Sending answer to user...")
                await bot.sendMessage(chatId, result.response.text(), {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '❌ Stop', callback_data: 'stop_ai' }]
                        ]
                    }
                });
            }
        }
    });
};

function calculateReputationDays(currentRepString, dailyGain = 2100) {
    const levels = [
        { name: "Дружелюбие", max: 6000 },
        { name: "Уважение", max: 12000 },
        { name: "Почтение", max: 21000 },
        { name: "Превознесение", max: 0 }
    ];
    
    const match = currentRepString.match(/(.+)\((\d+)\/(\d+)\)/);

    if (!match) {
        throw new Error("Неверный формат строки репутации");
    }
    
    let [, currentLevel, currentRep, maxRep] = match;
    currentRep = parseInt(currentRep);
    maxRep = parseInt(maxRep);
    
    let totalNeeded = 0;
    let found = false;
    
    for (let i = 0; i < levels.length - 1; i++) {
        if (levels[i].name === currentLevel) {
            totalNeeded += (maxRep - currentRep);
            found = true;
        } else if (found) {
            totalNeeded += levels[i].max;
        }
    }
    
    const days = Math.ceil(totalNeeded / dailyGain);
    return { days, totalNeeded };
}