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
    skipValidation: true // Offline / Cracked mode setting
});

// Recursive loop for digging
async function dig() {
    if (!isDigging) return;

    const block = bot.blockAtCursor(4);

    if (!block || block.name === "air") {
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

// Continuous placement loop based on video implementation
async function place() {
    if (!isPlacing) return;

    try {
        // Format input (e.g., "dark oak sapling" -> "dark_oak_sapling")
        const formattedTarget = placingItemName.toLowerCase().trim().replace(/\s+/g, "_");

        // 1. Find the item in the bot's inventory
        const item = bot.inventory.items().find((i) => {
            const name = i.name.toLowerCase();
            return name.includes(formattedTarget) || formattedTarget.includes(name);
        });

        if (!item) {
            bot.chat(`I ran out of ${placingItemName}! Stopping placement.`);
            console.log(`[Bot] Inventory check: Out of ${placingItemName}`);
            isPlacing = false;
            return;
        }

        // 2. Equip item to main hand (must await as shown in tutorial)
        if (!bot.heldItem || bot.heldItem.type !== item.type) {
            await bot.equip(item, "hand");
            await sleep(200); // Wait for equipment packet sync
        }

        // 3. Find the reference block the bot is looking at (raycast up to 4 blocks)
        const referenceBlock = bot.blockAtCursor(4);

        if (referenceBlock && referenceBlock.name !== "air") {
            // 4. Place the item onto the top face of the reference block (vec3(0, 1, 0))
            const topFaceVector = new vec3(0, 1, 0);
            await bot.placeBlock(referenceBlock, topFaceVector);
        } else {
            console.log("[Bot] No solid block found in line of sight to place onto.");
        }

    } catch (err) {
        // Output errors to console for troubleshooting
        if (err.message && !err.message.includes("Cancelled")) {
            console.log(`[Placement Error]: ${err.message}`);
        }
    }

    // Short pause between placements to prevent server spam kicks
    await sleep(300);

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

bot.on("spawn", () => {
    console.log("[Bot] Connected and ready!");
});

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
