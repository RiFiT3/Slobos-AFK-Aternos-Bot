const mineflayer = require("mineflayer");
const Groq = require("groq-sdk");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prefix = "!";

// ---------------------------------------------------------
// 1. GROQ AI CONFIGURATION
// ---------------------------------------------------------
const GROQ_API_KEY = "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";

const groq = new Groq({ apiKey: GROQ_API_KEY });

// ---------------------------------------------------------
// 2. MINEFLAYER BOT CONFIGURATION
// ---------------------------------------------------------
const bot = mineflayer.createBot({
    host: "Shifineyy.aternos.me",
    port: 46856,
    username: "LlamaAIBot",
    skipValidation: true // Offline / Cracked mode
});

bot.on("spawn", () => {
    console.log(`[Bot Online] Connected as ${bot.username}. AI features active!`);
});

// ---------------------------------------------------------
// 3. CHAT HANDLER
// ---------------------------------------------------------
bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

    if (message.startsWith(`${prefix}ai `) || message.startsWith(`${prefix}chat `)) {
        const prompt = message.replace(/^!(ai|chat)\s+/, "").trim();

        if (!prompt) {
            bot.chat("Ask me anything! Example: !ai How do I craft a shield?");
            return;
        }

        try {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are a friendly Minecraft companion bot playing on a server. Keep all replies very concise and under 180 characters so they fit nicely in chat."
                    },
                    {
                        role: "user",
                        content: `${username} asks: ${prompt}`
                    }
                ],
                model: "llama-3.1-8b-instant"
            });

            const responseText = chatCompletion.choices[0]?.message?.content?.trim() || "No response";

            // Split into short Minecraft chat chunks
            const chunks = responseText.match(/.{1,200}(\s|$)/g) || [responseText];

            for (const chunk of chunks) {
                if (chunk.trim().length > 0) {
                    bot.chat(chunk.trim());
                    await sleep(500);
                }
            }
        } catch (err) {
            console.error("[Groq API Error]:", err.message);
            bot.chat("Sorry, I had trouble processing that request!");
        }
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);
