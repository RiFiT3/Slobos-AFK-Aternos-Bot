const mineflayer = require("mineflayer");
const vec3 = require("vec3");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prefix = "!";

var isDigging = false;
var isPlacing = false;
var placingItemName = "";

const bot = mineflayer.createBot({
    host: "Shifineyy.aternos.me",
    port: 46856,
    username: "consistentMiner",
    skipValidation: true
});

// Recursive loop for digging
async function dig() {
    if (!isDigging) return;

    const block = bot.blockAtCursor(4);

    if (!block) {
        await sleep(100);
    } else {
        try {
            await bot.dig(block, "ignore", "raycast");
        } catch (err) {
            // Ignore minor digging interruptions
        }
    }
    
    await sleep(100);
    if (isDigging) dig();
}

// Fixed recursive loop for placing blocks/saplings
async function place() {
    if (!isPlacing) return;

    try {
        // Format input name for Minecraft internal IDs (e.g. "dark oak sapling" -> "dark_oak_sapling")
        const formattedTarget = placingItemName.toLowerCase().replace(/\s+/g, "_");

        // 1. Find the item in the inventory
        const item = bot.inventory.items().find((i) => {
            const itemName = i.name.toLowerCase();
            return itemName.includes(formattedTarget) || formattedTarget.includes(itemName);
        });

        if (!item) {
            bot.chat(`I don't have any ${placingItemName} in my inventory! Stopping.`);
            console.log(`[Bot] Out of item: ${placingItemName}`);
            isPlacing = false;
            return;
        }

        // 2. Equip only if not already held in hand
        if (!bot.heldItem || bot.heldItem.type !== item.type) {
            await bot.equip(item, "hand");
            await sleep(150); // Small pause for equipment sync
        }

        // 3. Find target block at cursor
        const targetBlock = bot.blockAtCursor(4);

        if (targetBlock && targetBlock.type !== 0) { // Ensure target block exists and isn't air
            // Place against top face of the block (0, 1, 0)
            await bot.placeBlock(targetBlock, vec3(0, 1, 0));
        }
    } catch (err) {
        // Log placement errors to terminal to help debug positioning issues
        if (err.message && !err.message.includes("Cancelled")) {
            console.log(`[Placement Error]: ${err.message}`);
        }
    }

    // Pause between placement attempts to prevent server spam
    await sleep(250);

    if (isPlacing) place();
}

function equipItem(itemName) {
    const formatted = itemName.toLowerCase().replace(/\s+/g, "_");
    const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(formatted));

    if (item) {
        bot.equip(item, "hand")
            .then(() => bot.chat(`Equipped ${item.name}!`))
            .catch((err) => console.log(`Equip error: ${err.message}`));
    } else {
        bot.chat(`I don't have ${itemName} in my inventory!`);
    }
}

bot.on("messagestr", (message) => console.log(message));

bot.on("chat", async (username, message) => {
    if (username === bot.username) return;
    if (!message.startsWith(prefix)) return;

    const [command, ...args] = message.slice(prefix.length).trim().split(/ +/g);

    if (command === "mining") {
        if (args.length < 1 || (args[0] !== "start" && args[0] !== "stop")) {
            bot.chat("You must tell me to start or stop!");
            return;
        }

        if (args[0] === "start") {
            bot.chat("Started digging!");
            isDigging = true;
            dig();
        } else if (args[0] === "stop") {
            bot.chat("Stopped digging!");
            isDigging = false;
        }
    } else if (command === "use" || command === "place") {
        let fullInput = args.join(" ").toLowerCase();

        if (fullInput.startsWith("item ")) {
            fullInput = fullInput.replace("item ", "").trim();
        }

        if (!fullInput || fullInput === "stop") {
            bot.chat("Stopped placing!");
            isPlacing = false;
            return;
        }

        placingItemName = fullInput;
        bot.chat(`Started placing ${placingItemName}!`);
        isPlacing = true;
        place();

    } else if (command === "equip") {
        if (args.length < 1) {
            bot.chat("You must specify an item name!");
            return;
        }

        equipItem(args.join(" "));
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);

