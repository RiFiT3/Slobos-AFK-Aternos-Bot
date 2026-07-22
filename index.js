const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalBlock, GoalFollow } = goals;
const Groq = require("groq-sdk");
const vec3 = require("vec3");

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
    skipValidation: true // Offline / Cracked mode
});

bot.loadPlugin(pathfinder);

let defaultMovements;
let isChopping = false;
let isClearing = false;
let isGuarding = false;

bot.once("spawn", () => {
    console.log(`[Bot Online] Connected as ${bot.username}!`);
    defaultMovements = new Movements(bot);
    bot.pathfinder.setMovements(defaultMovements);
});

// Helper: Get player entity
function getPlayer(username) {
    return bot.players[username]?.entity;
}

// ---------------------------------------------------------
// 2. AUTO-EAT SYSTEM
// ---------------------------------------------------------
const foodNames = ["cooked_beef", "cooked_porkchop", "cooked_chicken", "bread", "apple", "golden_apple", "baked_potato", "cooked_mutton", "cooked_cod", "cooked_salmon"];

bot.on("health", async () => {
    if (bot.food < 15) {
        const food = bot.inventory.items().find(i => foodNames.some(f => i.name.includes(f)));
        if (food) {
            try {
                await bot.equip(food, "hand");
                await bot.consume();
                console.log("[Auto-Eat] Pari ate food to replenish hunger!");
            } catch (err) {
                // Ignore if bot is busy doing another task
            }
        }
    }
});

// ---------------------------------------------------------
// 3. TASK FUNCTIONS
// ---------------------------------------------------------

// Stop all bot actions instantly
function stopAllTasks() {
    isChopping = false;
    isClearing = false;
    isGuarding = false;
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
}

// Feature: Auto Tree Chopper
async function chopTrees() {
    if (isChopping) return;
    isChopping = true;
    bot.chat("Starting tree chopping mode...");

    const logTypes = ["oak_log", "spruce_log", "birch_log", "jungle_log", "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"];

    while (isChopping) {
        const logBlock = bot.findBlock({
            matching: (block) => logTypes.includes(block.name),
            maxDistance: 20
        });

        if (!logBlock) {
            bot.chat("No more nearby tree logs found!");
            isChopping = false;
            break;
        }

        try {
            const p = logBlock.position;
            bot.pathfinder.setGoal(new GoalBlock(p.x, p.y, p.z));

            let timeout = 0;
            while (bot.entity.position.distanceTo(logBlock.position) > 2.5 && isChopping && timeout < 50) {
                await sleep(200);
                timeout++;
            }

            if (!isChopping) break;

            bot.pathfinder.setGoal(null);
            await bot.dig(logBlock);
            await sleep(200);
        } catch (err) {
            console.log("[Chop Error]:", err.message);
            await sleep(500);
        }
    }
}

// Feature: Cuboid Area Digging / Clearing (/fill air style)
async function clearArea(p1, p2) {
    if (isClearing) return;
    isClearing = true;

    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
    const minZ = Math.min(p1.z, p2.z), maxZ = Math.max(p1.z, p2.z);

    const totalBlocks = (maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1);
    bot.chat(`Clearing area (${totalBlocks} blocks total)... Type !stop to cancel.`);

    // Clear top layer to bottom layer
    for (let y = maxY; y >= minY; y--) {
        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                if (!isClearing) break;

                const targetPos = vec3(x, y, z);
                const block = bot.blockAt(targetPos);

                if (block && block.name !== "air" && block.name !== "bedrock" && block.name !== "water" && block.name !== "lava") {
                    try {
                        if (bot.entity.position.distanceTo(targetPos) > 4) {
                            bot.pathfinder.setGoal(new GoalBlock(x, y, z));
                            let timeout = 0;
                            while (bot.entity.position.distanceTo(targetPos) > 4 && isClearing && timeout < 40) {
                                await sleep(200);
                                timeout++;
                            }
                        }

                        if (!isClearing) break;
                        bot.pathfinder.setGoal(null);
                        await bot.dig(block);
                        await sleep(150);
                    } catch (err) {
                        console.log("[Clear Error]:", err.message);
                    }
                }
            }
            if (!isClearing) break;
        }
        if (!isClearing) break;
    }

    if (isClearing) {
        bot.chat("Finished clearing the area!");
        isClearing = false;
    }
}

// Feature: Bodyguard Mode
async function guardPlayer(username) {
    if (isGuarding) return;
    isGuarding = true;
    bot.chat(`Guarding active! Protecting ${username} from hostile mobs.`);

    const hostiles = ["zombie", "skeleton", "spider", "creeper", "enderman", "witch", "drowned", "husk", "stray"];

    while (isGuarding) {
        const mob = bot.nearestEntity(e => e.type === "mob" && hostiles.includes(e.name?.toLowerCase()) && bot.entity.position.distanceTo(e.position) < 14);

        if (mob) {
            bot.chat(`Attacking ${mob.name}!`);
            const weapon = bot.inventory.items().find(i => i.name.includes("sword") || i.name.includes("axe"));
            if (weapon) await bot.equip(weapon, "hand");

            bot.pathfinder.setGoal(new GoalFollow(mob, 1));
            while (mob.isValid && bot.entity.position.distanceTo(mob.position) < 4 && isGuarding) {
                await bot.attack(mob);
                await sleep(600);
            }
        } else {
            const owner = getPlayer(username);
            if (owner && bot.entity.position.distanceTo(owner.position) > 3) {
                bot.pathfinder.setGoal(new GoalFollow(owner, 2));
            }
        }
        await sleep(1000);
    }
}

// Feature: Collect Items on Ground
async function collectItems() {
    const itemEntity = bot.nearestEntity(e => (e.type === "object" || e.name === "item") && bot.entity.position.distanceTo(e.position) < 15);
    if (itemEntity) {
        bot.chat("Picking up nearby dropped items!");
        const p = itemEntity.position.floored();
        bot.pathfinder.setGoal(new GoalBlock(p.x, p.y, p.z));
    } else {
        bot.chat("No nearby items found on ground!");
    }
}

// ---------------------------------------------------------
// 4. CHAT HANDLER & COMMANDS
// ---------------------------------------------------------
bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

    const args = message.trim().split(" ");
    const cmd = args[0].toLowerCase();

    try {
        // AI COMMAND HANDLER
        if (cmd === "!ai" || cmd === "!chat") {
            const prompt = args.slice(1).join(" ").trim();
            if (!prompt) return bot.chat("Ask me questions or tell me to do tasks!");

            const lower = prompt.toLowerCase();

            if (lower.includes("follow me") || lower.includes("come here")) {
                const target = getPlayer(username);
                if (target) {
                    stopAllTasks();
                    bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
                    bot.chat(`On my way to follow you, ${username}!`);
                } else bot.chat("I can't see you!");
                return;
            } else if (lower.includes("stop") || lower.includes("cancel")) {
                stopAllTasks();
                bot.chat("Stopped all tasks!");
                return;
            } else if (lower.includes("chop") || lower.includes("cut tree")) {
                stopAllTasks();
                chopTrees();
                return;
            } else if (lower.includes("guard") || lower.includes("protect me")) {
                stopAllTasks();
                guardPlayer(username);
                return;
            } else if (lower.includes("collect") || lower.includes("pick up")) {
                collectItems();
                return;
            }

            // Normal Groq Llama 3 Chat
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: "You are Pari, a friendly Minecraft companion bot. Keep replies concise and under 180 characters." },
                    { role: "user", content: `${username} asks: ${prompt}` }
                ],
                model: "llama-3.1-8b-instant"
            });

            const responseText = chatCompletion.choices[0]?.message?.content?.trim() || "No response";
            const chunks = responseText.match(/.{1,200}(\s|$)/g) || [responseText];

            for (const chunk of chunks) {
                if (chunk.trim().length > 0) {
                    bot.chat(chunk.trim());
                    await sleep(500);
                }
            }
            return;
        }

        // DIRECT MANUAL COMMANDS
        switch (cmd) {
            case "!clear":
            case "!fill": {
                if (args.length < 7) return bot.chat("Usage: !clear <x1> <y1> <z1> <x2> <y2> <z2>");
                stopAllTasks();
                const p1 = vec3(parseInt(args[1]), parseInt(args[2]), parseInt(args[3]));
                const p2 = vec3(parseInt(args[4]), parseInt(args[5]), parseInt(args[6]));
                clearArea(p1, p2);
                break;
            }

            case "!guard":
            case "!protect": {
                stopAllTasks();
                guardPlayer(username);
                break;
            }

            case "!collect": {
                collectItems();
                break;
            }

            case "!goto": {
                if (args.length < 4) return bot.chat("Usage: !goto <x> <y> <z>");
                stopAllTasks();
                bot.pathfinder.setGoal(new GoalBlock(parseInt(args[1]), parseInt(args[2]), parseInt(args[3])));
                break;
            }

            case "!follow": {
                const target = getPlayer(args[1] || username);
                if (!target) return bot.chat("Player not visible!");
                stopAllTasks();
                bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
                break;
            }

            case "!chop":
            case "!tree": {
                stopAllTasks();
                chopTrees();
                break;
            }

            case "!stop": {
                stopAllTasks();
                bot.chat("Stopped all active tasks.");
                break;
            }

            case "!place": {
                if (args.length < 2) return bot.chat("Usage: !place <itemName>");
                const itemName = args.slice(1).join("_").toLowerCase();
                const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(itemName));
                if (!item) return bot.chat(`Don't have '${itemName}'!`);

                const yaw = bot.entity.yaw;
                const frontX = -Math.sin(yaw), frontZ = -Math.cos(yaw);
                const sourceBlock = bot.blockAt(bot.entity.position.offset(frontX, -1, frontZ).floored());

                if (sourceBlock) {
                    await bot.equip(item, "hand");
                    await bot.placeBlock(sourceBlock, vec3(0, 1, 0));
                    bot.chat(`Placed ${item.name}!`);
                }
                break;
            }

            case "!dig": {
                if (args.length === 4) {
                    const targetBlock = bot.blockAt(vec3(parseInt(args[1]), parseInt(args[2]), parseInt(args[3])));
                    if (targetBlock) await bot.dig(targetBlock);
                }
                break;
            }

            case "!drop": {
                if (args[1] === "all") {
                    for (const item of bot.inventory.items()) await bot.tossStack(item);
                    bot.chat("Dropped all items.");
                }
                break;
            }

            case "!pos": {
                const p = bot.entity.position.floored();
                bot.chat(`Position: X: ${p.x}, Y: ${p.y}, Z: ${p.z}`);
                break;
            }

            case "!help": {
                bot.chat("Commands: !ai, !clear, !guard, !collect, !chop, !follow, !goto, !stop, !place, !dig, !drop, !pos");
                break;
            }
        }
    } catch (err) {
        console.error("[Bot Error]:", err.message);
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);
