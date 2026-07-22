const mineflayer = require("mineflayer");
const { pathfinder, Movements, goals } = require("mineflayer-pathfinder");
const { GoalBlock, GoalFollow } = goals;
const vec3 = require("vec3");

// Server Connection Settings
const settings = {
    username: "HelperBot",
    host: "Shifineyy.aternos.me", // Change to your host / Aternos IP
    port: 46856,       // Change to your port
    skipValidation: true // Cracked / Offline mode
};

const bot = mineflayer.createBot(settings);

// Load Pathfinder Plugin for navigation
bot.loadPlugin(pathfinder);

let defaultMovements;

bot.once("spawn", () => {
    console.log(`[Bot Online] Logged in as ${bot.username}`);
    defaultMovements = new Movements(bot);
    bot.pathfinder.setMovements(defaultMovements);
});

// Helper: Find player entity by username
function getPlayer(username) {
    return bot.players[username]?.entity;
}

// ----------------------------------------------------
// CHAT COMMAND HANDLER
// ----------------------------------------------------
bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

    const args = message.trim().split(" ");
    const cmd = args[0].toLowerCase();

    try {
        switch (cmd) {
            // ==========================================
            // 1. NAVIGATION & MOVEMENT
            // ==========================================
            case "!goto": {
                // Command: !goto <x> <y> <z>
                if (args.length < 4) {
                    bot.chat("Usage: !goto <x> <y> <z>");
                    return;
                }
                const x = parseInt(args[1]);
                const y = parseInt(args[2]);
                const z = parseInt(args[3]);

                bot.chat(`Navigating to X: ${x}, Y: ${y}, Z: ${z}...`);
                bot.pathfinder.setGoal(new GoalBlock(x, y, z));
                break;
            }

            case "!follow": {
                // Command: !follow OR !follow <player>
                const targetName = args[1] || username;
                const targetEntity = getPlayer(targetName);

                if (!targetEntity) {
                    bot.chat(`I can't see ${targetName}!`);
                    return;
                }

                bot.chat(`Now following ${targetName}...`);
                // Follow target within 2 blocks distance
                bot.pathfinder.setGoal(new GoalFollow(targetEntity, 2), true);
                break;
            }

            case "!stop": {
                // Command: !stop
                bot.pathfinder.setGoal(null);
                bot.clearControlStates();
                bot.chat("Stopped all current tasks.");
                break;
            }

            // ==========================================
            // 2. LOOKING & VISION
            // ==========================================
            case "!look": {
                // Command: !look me OR !look player <name> OR !look pos <x> <y> <z>
                const mode = args[1]?.toLowerCase();

                if (mode === "me" || (!mode && getPlayer(username))) {
                    const p = getPlayer(username);
                    if (p) {
                        await bot.lookAt(p.position.offset(0, p.height, 0));
                        bot.chat(`Looking at ${username}.`);
                    } else {
                        bot.chat("I can't see you!");
                    }
                } else if (mode === "player" && args[2]) {
                    const p = getPlayer(args[2]);
                    if (p) {
                        await bot.lookAt(p.position.offset(0, p.height, 0));
                        bot.chat(`Looking at ${args[2]}.`);
                    } else {
                        bot.chat(`Player ${args[2]} not found!`);
                    }
                } else if (mode === "pos" && args.length >= 5) {
                    const x = parseFloat(args[2]);
                    const y = parseFloat(args[3]);
                    const z = parseFloat(args[4]);
                    await bot.lookAt(vec3(x, y, z));
                    bot.chat(`Looking at position (${x}, ${y}, ${z}).`);
                } else {
                    bot.chat("Usage: !look me | !look player <name> | !look pos <x> <y> <z>");
                }
                break;
            }

            // ==========================================
            // 3. BLOCK PLACEMENT
            // ==========================================
            case "!place":
            case "!use": {
                // Command: !place <itemName>
                if (args.length < 2) {
                    bot.chat("Usage: !place <itemName> (e.g. !place oak_sapling)");
                    return;
                }

                const itemName = args.slice(1).join("_").toLowerCase();
                const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(itemName));

                if (!item) {
                    bot.chat(`I don't have '${args.slice(1).join(" ")}' in my inventory!`);
                    return;
                }

                // Look for ground block directly in front of bot
                const yaw = bot.entity.yaw;
                const frontX = -Math.sin(yaw);
                const frontZ = -Math.cos(yaw);
                const frontPos = bot.entity.position.offset(frontX, -1, frontZ).floored();
                const sourceBlock = bot.blockAt(frontPos);

                if (!sourceBlock || sourceBlock.name === "air") {
                    bot.chat("No solid ground block directly in front to place on!");
                    return;
                }

                await bot.equip(item, "hand");
                await bot.placeBlock(sourceBlock, vec3(0, 1, 0));
                bot.chat(`Placed ${item.name} on top of ${sourceBlock.name}.`);
                break;
            }

            // ==========================================
            // 4. DIGGING & MINING
            // ==========================================
            case "!dig": {
                // Command: !dig <x> <y> <z> OR !dig <blockName>
                if (args.length === 4) {
                    const x = parseInt(args[1]);
                    const y = parseInt(args[2]);
                    const z = parseInt(args[3]);
                    const targetBlock = bot.blockAt(vec3(x, y, z));

                    if (!targetBlock || targetBlock.name === "air") {
                        bot.chat("That block is air or unloaded!");
                        return;
                    }

                    if (bot.canDigBlock(targetBlock)) {
                        bot.chat(`Digging ${targetBlock.name} at (${x}, ${y}, ${z})...`);
                        await bot.dig(targetBlock);
                        bot.chat("Finished digging!");
                    } else {
                        bot.chat("I cannot break that block from here!");
                    }
                } else if (args.length === 2) {
                    const blockName = args[1].toLowerCase();
                    const targetBlock = bot.findBlock({
                        matching: (b) => b.name.includes(blockName),
                        maxDistance: 5,
                    });

                    if (!targetBlock) {
                        bot.chat(`Couldn't find any nearby ${blockName}!`);
                        return;
                    }

                    bot.chat(`Found ${targetBlock.name}. Digging...`);
                    await bot.dig(targetBlock);
                    bot.chat("Dug the block!");
                } else {
                    bot.chat("Usage: !dig <x> <y> <z> OR !dig <blockName>");
                }
                break;
            }

            // ==========================================
            // 5. INVENTORY & UTILITIES
            // ==========================================
            case "!drop": {
                // Command: !drop <item> OR !drop all
                if (args[1] === "all") {
                    for (const item of bot.inventory.items()) {
                        await bot.tossStack(item);
                    }
                    bot.chat("Dropped all inventory items!");
                } else if (args[1]) {
                    const itemName = args.slice(1).join("_").toLowerCase();
                    const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(itemName));

                    if (item) {
                        await bot.tossStack(item);
                        bot.chat(`Dropped ${item.name}.`);
                    } else {
                        bot.chat(`Item '${args[1]}' not found in inventory.`);
                    }
                } else {
                    bot.chat("Usage: !drop <item> OR !drop all");
                }
                break;
            }

            case "!pos": {
                // Command: !pos
                const p = bot.entity.position.floored();
                bot.chat(`My current location: X: ${p.x}, Y: ${p.y}, Z: ${p.z}`);
                break;
            }

            case "!help": {
                bot.chat("Commands: !goto, !follow, !stop, !look, !place, !dig, !drop, !pos");
                break;
            }
        }
    } catch (err) {
        console.error("[Bot Error]:", err.message);
        bot.chat(`Error executing command: ${err.message}`);
    }
});

// Logs errors & disconnects
bot.on("kicked", console.log);
bot.on("error", console.log);
