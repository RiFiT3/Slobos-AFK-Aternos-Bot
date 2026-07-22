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
let mcData;
let isChopping = false;
let isClearing = false;
let isGuarding = false;
let isContinuousPlacing = false;
let isFishing = false;

bot.once("spawn", () => {
    console.log(`[Bot Online] Connected as ${bot.username}!`);
    
    mcData = require("minecraft-data")(bot.version);
    defaultMovements = new Movements(bot, mcData);

    defaultMovements.canDig = true;
    defaultMovements.allowParkour = true;
    defaultMovements.allowSprinting = true;

    const scaffoldBlockNames = [
        "dirt", "cobblestone", "stone", "oak_planks", "spruce_planks", 
        "birch_planks", "jungle_planks", "acacia_planks", "dark_oak_planks", 
        "cobbled_deepslate", "netherrack"
    ];
    
    defaultMovements.scafoldingBlocks = scaffoldBlockNames
        .map(name => mcData.blocksByName[name]?.id)
        .filter(id => id !== undefined);

    bot.pathfinder.setMovements(defaultMovements);
});

// Helper: Get player entity
function getPlayer(username) {
    return bot.players[username]?.entity;
}

// ---------------------------------------------------------
// 2. AUTO WEAPON, ARMOR & EAT SYSTEM
// ---------------------------------------------------------
async function equipBestEquipment() {
    const items = bot.inventory.items();

    const weaponPriority = [
        "netherite_sword", "diamond_sword", "iron_sword", "golden_sword", "stone_sword", "wooden_sword",
        "netherite_axe", "diamond_axe", "iron_axe", "golden_axe", "stone_axe", "wooden_axe"
    ];

    for (const name of weaponPriority) {
        const weapon = items.find(i => i.name === name);
        if (weapon) {
            try {
                await bot.equip(weapon, "hand");
                break;
            } catch (err) {}
        }
    }

    const armorSlots = {
        helmet: ["netherite_helmet", "diamond_helmet", "iron_helmet", "golden_helmet", "leather_helmet"],
        chestplate: ["netherite_chestplate", "diamond_chestplate", "iron_chestplate", "golden_chestplate", "leather_chestplate"],
        leggings: ["netherite_leggings", "diamond_leggings", "iron_leggings", "golden_leggings", "leather_leggings"],
        boots: ["netherite_boots", "diamond_boots", "iron_boots", "golden_boots", "leather_boots"]
    };

    for (const [slot, priority] of Object.entries(armorSlots)) {
        for (const name of priority) {
            const armor = items.find(i => i.name === name);
            if (armor) {
                try {
                    await bot.equip(armor, slot);
                    break;
                } catch (err) {}
            }
        }
    }
}

// Auto-Eat Monitor
const foodNames = ["cooked_beef", "cooked_porkchop", "cooked_chicken", "bread", "apple", "golden_apple", "baked_potato", "cooked_mutton", "cooked_cod", "cooked_salmon"];

bot.on("health", async () => {
    if (bot.food < 15) {
        const food = bot.inventory.items().find(i => foodNames.some(f => i.name.includes(f)));
        if (food) {
            try {
                await bot.equip(food, "hand");
                await bot.consume();
            } catch (err) {}
        }
    }
});

// ---------------------------------------------------------
// 3. TASK FUNCTIONS
// ---------------------------------------------------------

function stopAllTasks() {
    isChopping = false;
    isClearing = false;
    isGuarding = false;
    isContinuousPlacing = false;
    if (isFishing) {
        try { bot.activateItem(); } catch (e) {}
        isFishing = false;
    }
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
}

// Feature: Continuous Place (Tree Farm Sapling Auto-Replacer)
async function holdPlaceAt(itemName, targetPos) {
    if (isContinuousPlacing) return;
    isContinuousPlacing = true;
    bot.chat(`Auto-placing ${itemName} at X: ${targetPos.x}, Y: ${targetPos.y}, Z: ${targetPos.z}. Type !stop to pause.`);

    // Move close to target
    if (bot.entity.position.distanceTo(targetPos) > 3.5) {
        bot.pathfinder.setGoal(new GoalBlock(targetPos.x, targetPos.y, targetPos.z));
        let timeout = 0;
        while (bot.entity.position.distanceTo(targetPos) > 3.5 && isContinuousPlacing && timeout < 40) {
            await sleep(200);
            timeout++;
        }
        bot.pathfinder.setGoal(null);
    }

    const adjacentOffsets = [vec3(0, -1, 0), vec3(0, 1, 0), vec3(1, 0, 0), vec3(-1, 0, 0), vec3(0, 0, 1), vec3(0, 0, -1)];

    while (isContinuousPlacing) {
        const currentBlock = bot.blockAt(targetPos);

        // Place if block space is currently air/empty
        if (currentBlock && (currentBlock.name === "air" || currentBlock.name === "water")) {
            const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(itemName.toLowerCase()));

            if (!item) {
                bot.chat(`Out of ${itemName}s in inventory! Pausing place mode.`);
                isContinuousPlacing = false;
                break;
            }

            let refBlock = null;
            let faceVector = null;

            for (const offset of adjacentOffsets) {
                const checkPos = targetPos.plus(offset);
                const b = bot.blockAt(checkPos);
                if (b && b.name !== "air" && b.name !== "water" && b.name !== "lava") {
                    refBlock = b;
                    faceVector = vec3(-offset.x, -offset.y, -offset.z);
                    break;
                }
            }

            if (refBlock) {
                try {
                    await bot.equip(item, "hand");
                    await bot.lookAt(refBlock.position);
                    await bot.placeBlock(refBlock, faceVector);
                } catch (err) {}
            }
        }
        await sleep(250); // Checks 4 times per second
    }
}

// Feature: Auto Fishing
async function startFishing() {
    if (isFishing) return;
    isFishing = true;
    bot.chat("Starting auto-fishing...");

    const rod = bot.inventory.items().find(i => i.name.includes("fishing_rod"));
    if (!rod) {
        bot.chat("I don't have a fishing rod in my inventory!");
        isFishing = false;
        return;
    }

    await bot.equip(rod, "hand");

    while (isFishing) {
        try {
            await bot.fish();
        } catch (err) {
            console.log("[Fish Error]:", err.message);
            await sleep(1000);
        }
        await sleep(500);
    }
}

// Feature: Deposit items to nearby chest
async function depositItemsToChest() {
    const chestBlock = bot.findBlock({
        matching: (b) => b.name.includes("chest") || b.name.includes("barrel"),
        maxDistance: 5
    });

    if (!chestBlock) return bot.chat("No chest or barrel nearby!");

    try {
        const chest = await bot.openContainer(chestBlock);
        for (const item of bot.inventory.items()) {
            if (!item.name.includes("sword") && !item.name.includes("axe") && !item.name.includes("helmet") && !item.name.includes("chestplate")) {
                await chest.deposit(item.type, null, item.count);
                await sleep(150);
            }
        }
        chest.close();
        bot.chat("Successfully deposited non-equipment items into the chest!");
    } catch (err) {
        bot.chat("Failed to open chest!");
    }
}

// Feature: Place Single Block
async function placeBlockAt(itemName, targetPos) {
    const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(itemName.toLowerCase()));
    if (!item) return bot.chat(`Don't have '${itemName}'!`);

    const adjacentOffsets = [vec3(0, -1, 0), vec3(0, 1, 0), vec3(1, 0, 0), vec3(-1, 0, 0), vec3(0, 0, 1), vec3(0, 0, -1)];
    let refBlock = null, faceVector = null;

    for (const offset of adjacentOffsets) {
        const checkPos = targetPos.plus(offset);
        const b = bot.blockAt(checkPos);
        if (b && b.name !== "air" && b.name !== "water") {
            refBlock = b;
            faceVector = vec3(-offset.x, -offset.y, -offset.z);
            break;
        }
    }

    if (!refBlock) return bot.chat("No adjacent block to attach to!");

    if (bot.entity.position.distanceTo(targetPos) > 4) {
        bot.pathfinder.setGoal(new GoalBlock(targetPos.x, targetPos.y, targetPos.z));
        let timeout = 0;
        while (bot.entity.position.distanceTo(targetPos) > 4 && timeout < 40) {
            await sleep(200);
            timeout++;
        }
        bot.pathfinder.setGoal(null);
    }

    try {
        await bot.equip(item, "hand");
        await bot.lookAt(refBlock.position);
        await bot.placeBlock(refBlock, faceVector);
        bot.chat(`Placed ${item.name}!`);
    } catch (err) {
        bot.chat("Couldn't place block there!");
    }
}

// Feature: Auto Tree Chopper
async function chopTrees() {
    if (isChopping) return;
    isChopping = true;
    bot.chat("Starting tree chopping mode...");

    const logTypes = ["oak_log", "spruce_log", "birch_log", "jungle_log", "acacia_log", "dark_oak_log", "mangrove_log", "cherry_log"];

    while (isChopping) {
        const logBlock = bot.findBlock({ matching: (b) => logTypes.includes(b.name), maxDistance: 20 });
        if (!logBlock) {
            bot.chat("No more nearby logs!");
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
            await sleep(500);
        }
    }
}

// Feature: Cuboid Area Clearing
async function clearArea(p1, p2) {
    if (isClearing) return;
    isClearing = true;

    const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
    const minZ = Math.min(p1.z, p2.z), maxZ = Math.max(p1.z, p2.z);

    bot.chat(`Clearing area... Type !stop to cancel.`);

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
                    } catch (err) {}
                }
            }
            if (!isClearing) break;
        }
        if (!isClearing) break;
    }

    if (isClearing) {
        bot.chat("Finished clearing!");
        isClearing = false;
    }
}

// Feature: Bodyguard Mode
async function guardPlayer(username) {
    if (isGuarding) return;
    isGuarding = true;
    bot.chat(`Shields up! Guarding ${username}.`);

    await equipBestEquipment();
    const hostiles = ["zombie", "skeleton", "spider", "creeper", "enderman", "witch", "drowned", "husk", "stray", "phantom"];

    while (isGuarding) {
        await equipBestEquipment();

        const mob = bot.nearestEntity(e => {
            if (!e || !e.name) return false;
            return (e.type === "mob" || e.type === "hostile") && hostiles.some(h => e.name.toLowerCase().includes(h)) && bot.entity.position.distanceTo(e.position) < 16;
        });

        if (mob) {
            while (mob.isValid && mob.health > 0 && bot.entity.position.distanceTo(mob.position) < 16 && isGuarding) {
                bot.pathfinder.setGoal(new GoalFollow(mob, 1.5), true);
                if (bot.entity.position.distanceTo(mob.position) <= 4.5) {
                    await bot.lookAt(mob.position.offset(0, mob.height * 0.8, 0));
                    bot.attack(mob);
                }
                await sleep(550);
            }
        } else {
            const owner = getPlayer(username);
            if (owner && bot.entity.position.distanceTo(owner.position) > 3) {
                bot.pathfinder.setGoal(new GoalFollow(owner, 2), true);
            }
        }
        await sleep(500);
    }
}

// Feature: Collect Ground Items
async function collectItems() {
    const itemEntity = bot.nearestEntity(e => (e.type === "object" || e.name === "item") && bot.entity.position.distanceTo(e.position) < 15);
    if (itemEntity) {
        bot.chat("Picking up items!");
        const p = itemEntity.position.floored();
        bot.pathfinder.setGoal(new GoalBlock(p.x, p.y, p.z));
    } else {
        bot.chat("No nearby items found!");
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

            if (lower.includes("follow me")) {
                const target = getPlayer(username);
                if (target) {
                    stopAllTasks();
                    bot.pathfinder.setGoal(new GoalFollow(target, 2), true);
                    bot.chat(`Following ${username}!`);
                }
                return;
            } else if (lower.includes("stop")) {
                stopAllTasks();
                bot.chat("Stopped all tasks!");
                return;
            } else if (lower.includes("chop")) {
                stopAllTasks();
                chopTrees();
                return;
            } else if (lower.includes("guard") || lower.includes("protect")) {
                stopAllTasks();
                guardPlayer(username);
                return;
            } else if (lower.includes("fish")) {
                stopAllTasks();
                startFishing();
                return;
            }

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

        // DIRECT COMMAND SWITCH
        switch (cmd) {
            case "!holdplace": {
                if (args.length === 5) {
                    // Usage: !holdplace <item> <x> <y> <z>
                    stopAllTasks();
                    const itemName = args[1];
                    const pos = vec3(parseInt(args[2]), parseInt(args[3]), parseInt(args[4]));
                    holdPlaceAt(itemName, pos);
                } else {
                    bot.chat("Usage: !holdplace <item> <x> <y> <z>");
                }
                break;
            }

            case "!place": {
                if (args.length === 5) {
                    stopAllTasks();
                    const itemName = args[1];
                    const pos = vec3(parseInt(args[2]), parseInt(args[3]), parseInt(args[4]));
                    placeBlockAt(itemName, pos);
                } else if (args.length >= 2) {
                    stopAllTasks();
                    const itemName = args.slice(1).join("_").toLowerCase();
                    const yaw = bot.entity.yaw;
                    const pos = bot.entity.position.offset(-Math.sin(yaw), 0, -Math.cos(yaw)).floored();
                    placeBlockAt(itemName, pos);
                }
                break;
            }

            case "!fish": {
                stopAllTasks();
                startFishing();
                break;
            }

            case "!deposit": {
                depositItemsToChest();
                break;
            }

            case "!clear":
            case "!fill": {
                if (args.length < 7) return bot.chat("Usage: !clear <x1> <y1> <z1> <x2> <y2> <z2>");
                stopAllTasks();
                clearArea(vec3(parseInt(args[1]), parseInt(args[2]), parseInt(args[3])), vec3(parseInt(args[4]), parseInt(args[5]), parseInt(args[6])));
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

            case "!dig": {
                if (args.length === 4) {
                    const block = bot.blockAt(vec3(parseInt(args[1]), parseInt(args[2]), parseInt(args[3])));
                    if (block) await bot.dig(block);
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
                bot.chat("Commands: !ai, !holdplace, !place, !fish, !deposit, !clear, !guard, !collect, !chop, !follow, !goto, !stop, !pos");
                break;
            }
        }
    } catch (err) {
        console.error("[Bot Error]:", err.message);
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);
