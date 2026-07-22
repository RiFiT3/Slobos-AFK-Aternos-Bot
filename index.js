const mineflayer = require("mineflayer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prefix = "!";

// ---------------------------------------------------------
// 1. GEMINI AI CONFIGURATION
// ---------------------------------------------------------
const GEMINI_API_KEY = "AQ.Ab8RN6I-uUfl8_4QZfLhYqp8AZOcF32bo20bqhkUbre55OzIgA";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: "You are a friendly, helpful Minecraft companion bot playing on a server. Keep all responses very concise and under 200 characters so they fit nicely in Minecraft chat without spamming."
});

// ---------------------------------------------------------
// 2. MINEFLAYER BOT CONFIGURATION
// ---------------------------------------------------------
const bot = mineflayer.createBot({
    host: "Shifineyy.aternos.me",
    port: 46856,
    username: "GeminiBot",
    skipValidation: true // Offline / Cracked mode
});

bot.on("spawn", () => {
    console.log(`[Bot Online] Connected as ${bot.username}. AI features enabled!`);
});

// ---------------------------------------------------------
// 3. CHAT HANDLER (AI INTEGRATION)
// ---------------------------------------------------------
bot.on("chat", async (username, message) => {
    // Ignore messages sent by the bot itself
    if (username === bot.username) return;

    // Check for AI commands: !ai or !chat
    if (message.startsWith(`${prefix}ai `) || message.startsWith(`${prefix}chat `)) {
        const prompt = message.replace(/^!(ai|chat)\s+/, "").trim();

        if (!prompt) {
            bot.chat("Ask me anything! Example: !ai How do I craft an anvil?");
            return;
        }

        try {
            // Send request to Gemini API
            const result = await model.generateContent(`${username} asks: ${prompt}`);
            const responseText = result.response.text().trim();

            // Minecraft chat limits messages to ~256 characters.
            // Split long AI responses into smaller chunks.
            const chunks = responseText.match(/.{1,200}(\s|$)/g) || [responseText];
            
            for (const chunk of chunks) {
                if (chunk.trim().length > 0) {
                    bot.chat(chunk.trim());
                    await sleep(600); // Small pause between chat messages
                }
            }
        } catch (err) {
            console.error("[Gemini API Error]:", err.message);
            bot.chat("Sorry, my AI brain had trouble answering that!");
        }
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);
