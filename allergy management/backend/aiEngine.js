require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function chatWithAi(userQuestion, userAllergy) {
    console.log("--- AI REQUEST STARTED ---");

    // We will try these models in order until one works
    const modelsToTry = [
        "gemini-2.5-flash",       // Your account specifically listed this
        "gemini-flash-latest",    // The generic alias
        "gemini-pro",             // The classic stable model
        "gemini-1.5-flash-8b"     // A backup lightweight model
    ];

    let lastError = "";

    for (const modelName of modelsToTry) {
        try {
            console.log(`👉 Attempting to use model: ${modelName}`);
            
            const model = genAI.getGenerativeModel({ model: modelName });
            const prompt = `User has ${userAllergy} allergy. Question: ${userQuestion}. Answer briefly.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            console.log(`✅ SUCCESS! Connected using ${modelName}`);
            return text; // It worked! Return the answer.

        } catch (error) {
            console.error(`❌ ${modelName} Failed:`, error.message);
            lastError = error.message;
            // Loop continues to the next model...
        }
    }

    // If we get here, ALL models failed.
    // Return the technical error to the chat window so we can read it.
    return `SYSTEM FAILURE: All models failed. Last Error: ${lastError}`;
}

module.exports = { chatWithAi };