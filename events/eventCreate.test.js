require('dotenv').config();
const { userStates, TestsSchema } = require('./eventCreate'); // Adjust the import as necessary
const TelegramBot = require('node-telegram-bot-api');

jest.mock('./eventCreate', () => {
  const originalModule = jest.requireActual('./eventCreate');
  return {
    ...originalModule,
    bot: {
      sendMessage: jest.fn(),
      on: jest.fn()
    },
    userStates: {},
    TestsSchema: jest.fn().mockImplementation(() => ({
      save: jest.fn().mockResolvedValue(true)
    }))
  };
});

describe('eventCreate', () => {
  let bot;
  let messageCallback;

  beforeEach(() => {
    bot = require('./eventCreate').bot;
    messageCallback = null;
    bot.on.mockImplementation((event, callback) => {
      console.log('Event registered:', event); // Ensure this log is visible
      if (event === 'message') {
        messageCallback = callback;
      }
    });
  });

  it('should create a test correctly', async () => {
    const chatId = 1;
    const sendMessageMock = bot.sendMessage;

    // Simulate the 'create_test' command
    userStates[chatId] = { stage: 'title', data: { name: "", description: "", questions: [] } };
    await bot.sendMessage(chatId, 'Please enter the tests:\nFormat:\nTitle\nDescription\nQuestion\nAnswer(true/false)\n\nQuestions and answers are limitless and should be separated by a new line.\nExample:\nTest1\nThis is a test\nWhat is 1+1?\n2(true)\n3(false)\n4(false)\nWhat is 2+1?\n4(false)\n3(true)', { reply_markup: { remove_keyboard: true } });

    // Check if the initial prompt message was sent
    expect(sendMessageMock).toHaveBeenCalledWith(chatId, 'Please enter the tests:\nFormat:\nTitle\nDescription\nQuestion\nAnswer(true/false)\n\nQuestions and answers are limitless and should be separated by a new line.\nExample:\nTest1\nThis is a test\nWhat is 1+1?\n2(true)\n3(false)\n4(false)\nWhat is 2+1?\n4(false)\n3(true)', { reply_markup: { remove_keyboard: true } });

    // Simulate the user input
    if (messageCallback) {
      console.log('Message callback is set'); // Ensure this log is visible
      await messageCallback({
        chat: { id: chatId },
        text: 'Test1\nThis is a test\nWhat is 1+1?\n2(true)\n3(false)\n4(false)\nWhat is 2+1?\n4(false)\n3(true)'
      });
    } else {
      console.log('Message callback is not set'); // Ensure this log is visible
    }

    // Check if the success message was sent
    expect(sendMessageMock).toHaveBeenCalledWith(chatId, 'Test created successfully!');
  });
});