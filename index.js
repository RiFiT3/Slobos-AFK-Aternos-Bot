const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalBlock, GoalFollow } = goals;
const Groq = require("groq-sdk");
const vec3 = require("vec3");
const vm = require("vm");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prefix = "!";

// ---------------------------------------------------------
// 1. CONFIGURATION
// ---------------------------------------------------------
const GROQ_API_KEY = "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";
const groq = new Groq({ apiKey: GROQ_API_KEY });

const bot = mineflayer.createBot({
    host: "Shifineyy.aternos.me",
    port: 46856,
    username: "Pari",
    skipValidation: true
});

bot.loadPlugin(pathfinder);

let defaultMovements;
let mcData;

bot.once("spawn", () => {
    console.log(`[Bot Online] Connected as ${bot.username}! Dynamic AI Code Execution Enabled.`);
    mcData = require("minecraft-data")(bot.version);
    defaultMovements = new Movements(bot, mcData);
    defaultMovements.canDig = true;
    defaultMovements.allowParkour = true;
    defaultMovements.allowSprinting = true;
    bot.pathfinder.setMovements(defaultMovements);
});

// Helper: Get player entity
function getPlayer(username) {
    return bot.players[username]?.entity;
}

// ---------------------------------------------------------
// 2. DYNAMIC AI CODE GENERATION & EXECUTION
// ---------------------------------------------------------
async function generateAndRunCode(userPrompt, username) {
    bot.chat("Thinking and writing code for that task...");

    const systemPrompt = `
You are Pari, an AI controlling a Minecraft Mineflayer bot. 
Your goal is to write JavaScript code using Mineflayer to perform the user's requested action.

Available Globals in Sandbox Environment:
- bot: The Mineflayer bot instance.
- vec3: The vec3 library for vectors.
- sleep(ms): Promise-based timeout helper function.
- username: Name of player who asked ("${username}").
- player: The player entity object if visible.

Rules:
1. ONLY return executable JavaScript code enclosed inside a markdown block: \`\`\`javascript ... \`\`\`
2. Do NOT add explanation text outside the code block.
3. Keep the code safe, asynchronous if needed, and handle missing blocks or items gracefully using bot.chat().
4. Example task "build 3 block high pillar":
\`\`\`javascript
async function execute() {
    const item = bot.inventory.items().find(i => i.name.includes("dirt") || i.name.includes("cobblestone"));
    if (!item) return bot.chat("I need dirt or cobblestone in my inventory!");
    await bot.equip(item, "hand");
    const pos = bot.entity.position.floored();
    for (let i = 0; i < 3; i++) {
        const target = pos.offset(1, i, 0);
        const ref = bot.blockAt(target.offset(0, -1, 0));
        if (ref) await bot.placeBlock(ref, vec3(0, 1, 0));
        await sleep(300);
    }
    bot.chat("Finished building!");
}
execute();
\`\`\`
`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Player ${username} says: ${userPrompt}` }
            ],
            model: "llama-3.1-8b-instant"
        });

        const reply = chatCompletion.choices[0]?.message?.content?.trim() || "";
        const codeMatch = reply.match(/```javascript\n([\s\S]*?)\n```/) || reply.match(/```\n([\s\S]*?)\n```/);

        if (!codeMatch) {
            // Standard conversational response if no code block was generated
            const cleanReply = reply.replace(/```/g, "").trim();
            bot.chat(cleanReply.slice(0, 180));
            return;
        }

        const codeToExecute = codeMatch[1];
        console.log("[AI Generated Code]:\n", codeToExecute);

        // Run code safely in Node.js VM context
        const sandbox = {
            bot,
            vec3,
            sleep,
            username,
            player: getPlayer(username),
            console
        };

        const context = vm.createContext(sandbox);
        const script = new vm.Script(`(async () => { ${codeToExecute} })()`);
        
        await script.runInContext(context, { timeout: 30000 }); // 30-second execution safety limit

    } catch (err) {
        console.error("[Dynamic Exec Error]:", err.message);
        bot.chat("Had trouble writing or running code for that task!");
    }
}

// ---------------------------------------------------------
// 3. CHAT HANDLER
// ---------------------------------------------------------
bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

    if (message.startsWith(`${prefix}ai `) || message.startsWith(`${prefix}chat `)) {
        const prompt = message.replace(/^!(ai|chat)\s+/, "").trim();
        if (!prompt) return bot.chat("Tell me what you want me to do or ask a question!");

        // Delegate prompt to Dynamic AI Code Generator
        await generateAndRunCode(prompt, username);
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);
