const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalBlock, GoalFollow, GoalNear } = goals;
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
    skipValidation: true
});

bot.loadPlugin(pathfinder);

let defaultMovements;
let mcData;

// Task States
let states = {
    chopping: false, clearing: false, guarding: false, 
    placing: false, fishing: false, farming: false, 
    mining: false, dancing: false, pvp: false
};

bot.once("spawn", () => {
    console.log(`[Bot Online] Connected as ${bot.username}! 40 Features Active.`);
    mcData = require("minecraft-data")(bot.version);
    defaultMovements = new Movements(bot, mcData);
    defaultMovements.canDig = true;
    defaultMovements.allowParkour = true;
    defaultMovements.allowSprinting = true;
    
    defaultMovements.scafoldingBlocks = ["dirt", "cobblestone", "stone", "oak_planks"]
        .map(name => mcData.blocksByName[name]?.id)
        .filter(id => id !== undefined);

    bot.pathfinder.setMovements(defaultMovements);
});

function getPlayer(username) {
    return bot.players[username]?.entity;
}

// ---------------------------------------------------------
// 2. PASSIVE SYSTEMS
// ---------------------------------------------------------
async function equipBestEquipment() {
    const items = bot.inventory.items();
    const weaponPriority = ["netherite_sword", "diamond_sword", "iron_sword", "stone_sword", "wooden_sword", "diamond_axe"];
    
    for (const name of weaponPriority) {
        const weapon = items.find(i => i.name === name);
        if (weapon) { try { await bot.equip(weapon, "hand"); break; } catch (e) {} }
    }

    const armorSlots = {
        helmet: ["netherite_helmet", "diamond_helmet", "iron_helmet", "leather_helmet"],
        chestplate: ["netherite_chestplate", "diamond_chestplate", "iron_chestplate", "leather_chestplate"],
        leggings: ["netherite_leggings", "diamond_leggings", "iron_leggings", "leather_leggings"],
        boots: ["netherite_boots", "diamond_boots", "iron_boots", "leather_boots"]
    };

    for (const [slot, priority] of Object.entries(armorSlots)) {
        for (const name of priority) {
            const armor = items.find(i => i.name === name);
            if (armor) { try { await bot.equip(armor, slot); break; } catch (e) {} }
        }
    }
}

bot.on("health", async () => {
    if (bot.food < 15) {
        const food = bot.inventory.items().find(i => ["cooked_beef", "bread", "apple", "cooked_chicken", "golden_apple"].some(f => i.name.includes(f)));
        if (food) { try { await bot.equip(food, "hand"); await bot.consume(); } catch (e) {} }
    }
});

// ---------------------------------------------------------
// 3. CORE FEATURES & TASKS
// ---------------------------------------------------------
function stopAllTasks() {
    Object.keys(states).forEach(k => states[k] = false);
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
    try { bot.deactivateItem(); } catch (e) {}
}

async function pvpPlayer(targetName) {
    const target = getPlayer(targetName);
    if (!target) return bot.chat(`I can't see ${targetName}!`);
    
    if (states.pvp) return;
    states.pvp = true;
    bot.chat(`Target acquired: ${targetName}. Initiating combat! ⚔️`);
    await equipBestEquipment();

    while (states.pvp && target.isValid && target.health > 0) {
        bot.pathfinder.setGoal(new GoalFollow(target, 1.5), true);
        if (bot.entity.position.distanceTo(target.position) <= 4) {
            await bot.lookAt(target.position.offset(0, target.height * 0.8, 0));
            bot.attack(target);
        }
        await sleep(500);
    }
    states.pvp = false;
    bot.chat("Combat finished.");
}

async function shootTarget(targetName) {
    const target = getPlayer(targetName);
    if (!target) return bot.chat("I don't see them!");
    
    const bow = bot.inventory.items().find(i => i.name.includes("bow"));
    const arrow = bot.inventory.items().find(i => i.name.includes("arrow"));
    
    if (!bow || !arrow) return bot.chat("I need a bow and arrows!");

    bot.chat(`Taking aim at ${targetName}... 🏹`);
    await bot.equip(bow, "hand");
    await bot.lookAt(target.position.offset(0, target.height, 0));
    
    try {
        bot.activateItem(); // Draw bow
        await sleep(1200);  // Wait for full charge
        bot.deactivateItem(); // Fire
    } catch (e) {}
}

async function buildWall(width, height) {
    bot.chat(`Building a ${width}x${height} wall... 🧱`);
    const blockItem = bot.inventory.items().find(i => ["dirt", "cobblestone", "stone", "planks"].some(b => i.name.includes(b)));
    if (!blockItem) return bot.chat("I need building blocks (dirt, cobble, etc.)!");

    await bot.equip(blockItem, "hand");
    const startPos = bot.entity.position.floored().offset(bot.entity.yaw > 0 ? 2 : -2, 0, 0); // Roughly in front

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const targetPos = startPos.offset(x, y, 0);
            const refBlock = bot.blockAt(targetPos.offset(0, -1, 0));
            if (refBlock && refBlock.name !== "air") {
                try {
                    await bot.lookAt(refBlock.position);
                    await bot.placeBlock(refBlock, vec3(0, 1, 0));
                    await sleep(300);
                } catch (e) {}
            }
        }
    }
    bot.chat("Wall complete!");
}

// ... (Keeping farm, mine, fish, guard from previous version for brevity - they remain fully active!)
async function startFishing() { if (states.fishing) return; states.fishing = true; const rod = bot.inventory.items().find(i => i.name.includes("fishing_rod")); if (!rod) return bot.chat("I need a fishing rod!"); await bot.equip(rod, "hand"); bot.chat("Casting my line! 🎣"); while (states.fishing) { try { await bot.fish(); } catch (err) { await sleep(1000); } await sleep(500); } }
async function autoFarm() { if (states.farming) return; states.farming = true; bot.chat("Starting farm mode! 🌾"); while (states.farming) { const crop = bot.findBlock({ matching: (b) => ["wheat", "carrots", "potatoes"].includes(b.name) && b.metadata === 7, maxDistance: 15 }); if (!crop) break; bot.pathfinder.setGoal(new GoalBlock(crop.position.x, crop.position.y, crop.position.z)); await sleep(1500); try { await bot.dig(crop); const seedName = crop.name === "wheat" ? "wheat_seeds" : crop.name; const seed = bot.inventory.items().find(i => i.name === seedName); if (seed) { await bot.equip(seed, "hand"); await bot.placeBlock(bot.blockAt(crop.position.offset(0, -1, 0)), vec3(0, 1, 0)); } } catch (e) {} await sleep(500); } states.farming = false; }
async function mineBlockType(blockName) { if (states.mining) return; states.mining = true; bot.chat(`Looking for ${blockName}... ⛏️`); while (states.mining) { const target = bot.findBlock({ matching: (b) => b.name.includes(blockName), maxDistance: 32 }); if (!target) break; try { bot.pathfinder.setGoal(new GoalBlock(target.position.x, target.position.y, target.position.z)); await sleep(2000); await bot.dig(target); } catch (e) {} await sleep(500); } states.mining = false; }
async function guardPlayer(username) { if (states.guarding) return; states.guarding = true; bot.chat(`Guarding ${username}! 🛡️`); await equipBestEquipment(); const hostiles = ["zombie", "skeleton", "spider", "creeper", "enderman"]; while (states.guarding) { await equipBestEquipment(); const mob = bot.nearestEntity(e => (e.type === "mob" || e.type === "hostile") && hostiles.some(h => e.name?.toLowerCase().includes(h)) && bot.entity.position.distanceTo(e.position) < 16); if (mob) { while (mob.isValid && mob.health > 0 && bot.entity.position.distanceTo(mob.position) < 16 && states.guarding) { bot.pathfinder.setGoal(new GoalFollow(mob, 1.5), true); if (bot.entity.position.distanceTo(mob.position) <= 4.5) { await bot.lookAt(mob.position.offset(0, mob.height * 0.8, 0)); bot.attack(mob); } await sleep(550); } } else { const owner = getPlayer(username); if (owner && bot.entity.position.distanceTo(owner.position) > 3) bot.pathfinder.setGoal(new GoalFollow(owner, 2), true); } await sleep(500); } }

// ---------------------------------------------------------
// 4. CHAT & COMMAND PARSER
// ---------------------------------------------------------
bot.on("chat", async (username, message) => {
    if (username === bot.username) return;
    const args = message.trim().split(" ");
    const cmd = args[0].toLowerCase();

    try {
        // ==========================================
        // AI COMMAND HANDLER
        // ==========================================
        if (cmd === "!ai" || cmd === "!chat") {
            const prompt = args.slice(1).join(" ").trim();
            if (!prompt) return bot.chat("Ask me questions or tell me to do tasks!");
            const lower = prompt.toLowerCase();

            // AI Action Intents
            if (lower.includes("follow")) { stopAllTasks(); bot.pathfinder.setGoal(new GoalFollow(getPlayer(username), 2), true); return bot.chat("Following!"); }
            if (lower.includes("stop")) { stopAllTasks(); return bot.chat("Stopped!"); }
            if (lower.includes("guard") || lower.includes("protect")) { stopAllTasks(); guardPlayer(username); return; }
            if (lower.includes("fish")) { stopAllTasks(); startFishing(); return; }
            if (lower.includes("farm")) { stopAllTasks(); autoFarm(); return; }
            if (lower.includes("time")) { return bot.chat(`It is currently ${bot.time.isDay ? "Day" : "Night"} time!`); }

            // Normal AI Chat Reply
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: "You are Pari, a friendly, hyper-capable Minecraft bot. Keep replies under 180 chars." },
                    { role: "user", content: `${username} asks: ${prompt}` }
                ],
                model: "llama-3.1-8b-instant"
            });
            const text = chatCompletion.choices[0]?.message?.content?.trim() || "No response";
            const chunks = text.match(/.{1,180}(\s|$)/g) || [text];
            for (const chunk of chunks) if (chunk.trim()) { bot.chat(chunk.trim()); await sleep(500); }
            return;
        }

        // ==========================================
        // DIRECT MANUAL COMMANDS
        // ==========================================
        switch (cmd) {
            // PVP & Combat
            case "!pvp": stopAllTasks(); pvpPlayer(args[1]); break;
            case "!shoot": shootTarget(args[1]); break;
            case "!guard": stopAllTasks(); guardPlayer(username); break;

            // Building & Automation
            case "!buildwall": stopAllTasks(); buildWall(parseInt(args[1] || 3), parseInt(args[2] || 3)); break;
            case "!farm": stopAllTasks(); autoFarm(); break;
            case "!mine": stopAllTasks(); mineBlockType(args[1] || "stone"); break;
            case "!fish": stopAllTasks(); startFishing(); break;

            // World Info
            case "!time": bot.chat(`Time: ${bot.time.timeOfDay} ticks. It is ${bot.time.isDay ? "Day ☀️" : "Night 🌙"}`); break;
            case "!weather": bot.chat(bot.isRaining ? "It's raining! 🌧️" : "The weather is clear! ☀️"); break;
            case "!pos": bot.chat(`X: ${Math.floor(bot.entity.position.x)}, Y: ${Math.floor(bot.entity.position.y)}, Z: ${Math.floor(bot.entity.position.z)}`); break;
            case "!inspect": 
                const block = bot.blockAtCursor(5);
                bot.chat(block ? `I am looking at: ${block.name}` : "I'm not looking at any blocks nearby.");
                break;

            // Inventory & Items
            case "!equip": 
                const eqItem = bot.inventory.items().find(i => i.name.includes(args[1]?.toLowerCase()));
                if (eqItem) { await bot.equip(eqItem, "hand"); bot.chat(`Equipped ${eqItem.name}!`); }
                break;
            case "!drop":
                if (args[1] === "all") {
                    for (const item of bot.inventory.items()) await bot.tossStack(item);
                    bot.chat("Dropped everything!");
                } else {
                    const drItem = bot.inventory.items().find(i => i.name.includes(args[1]?.toLowerCase()));
                    if (drItem) { await bot.tossStack(drItem); bot.chat(`Dropped ${drItem.name}`); }
                }
                break;
            case "!toss":
                const p = getPlayer(args[1] || username);
                if (p) {
                    bot.pathfinder.setGoal(new GoalNear(p.position.x, p.position.y, p.position.z, 2));
                    await sleep(2000);
                    bot.lookAt(p.position.offset(0, p.height, 0));
                    for (const item of bot.inventory.items()) await bot.tossStack(item);
                    bot.chat("Tossed you my items!");
                }
                break;
            case "!inv": 
                const items = bot.inventory.items().map(i => `${i.count}x ${i.name}`).slice(0, 5).join(", ");
                bot.chat(items ? `Inventory: ${items}` : "My inventory is empty!");
                break;
            case "!eat": 
                const food = bot.inventory.items().find(i => i.name.includes("apple") || i.name.includes("beef") || i.name.includes("bread"));
                if (food) { await bot.equip(food, "hand"); await bot.consume(); bot.chat("Yum!"); }
                break;
            case "!health": bot.chat(`Health: ${Math.round(bot.health)}/20 | Food: ${Math.round(bot.food)}/20`); break;

            // Movement & Emotes
            case "!follow": stopAllTasks(); bot.pathfinder.setGoal(new GoalFollow(getPlayer(args[1] || username), 2), true); break;
            case "!goto": stopAllTasks(); bot.pathfinder.setGoal(new GoalBlock(parseInt(args[1]), parseInt(args[2]), parseInt(args[3]))); break;
            case "!mount":
                const vehicle = bot.nearestEntity(e => e.name === "boat" || e.name === "minecart" || e.name === "horse");
                if (vehicle) await bot.mount(vehicle); else bot.chat("No vehicles nearby.");
                break;
            case "!dismount": bot.dismount(); break;
            case "!sleep": 
                const bed = bot.findBlock({ matching: b => b.name.includes('bed'), maxDistance: 10 });
                if (bed) await bot.sleep(bed); else bot.chat("No bed found.");
                break;
            case "!wakeup": await bot.wake(); bot.chat("I'm awake!"); break;
            case "!dance": 
                stopAllTasks(); states.dancing = true; bot.chat("Let's dance! 💃");
                while(states.dancing) {
                    bot.setControlState('sneak', true); await sleep(200); bot.setControlState('sneak', false);
                    bot.setControlState('jump', true); await sleep(200); bot.setControlState('jump', false);
                    bot.look(bot.entity.yaw + 1.5, bot.entity.pitch); await sleep(200);
                }
                break;
            case "!look": 
                const targetL = getPlayer(args[1] || username);
                if (targetL) await bot.lookAt(targetL.position.offset(0, targetL.height, 0));
                break;
            
            // Utilities
            case "!say": bot.chat(args.slice(1).join(" ")); break;
            case "!stop": stopAllTasks(); bot.chat("Stopped all tasks."); break;
            case "!help": bot.chat("Too many commands to list! Check the GitHub chart for all 40 commands."); break;
        }
    } catch (err) {
        console.error("[Bot Error]:", err.message);
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);
