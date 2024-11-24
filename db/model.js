const mongoose = require("mongoose");

const TestsSchema = mongoose.model("Astrassistant-Tests", new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    questions: [{
        question: String,
        answers: [{
            answer: String,
            isCorrect: Boolean
        }]
    }]
}));

module.exports = { TestsSchema };