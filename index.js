const mineflayer = require("mineflayer");
const vec3 = require("vec3");

const settings = {
    username: "consistentMiner",
    host: "Shifineyy.aternos.me",
    port: 46856,
    skipValidation: true // Offline / Cracked mode
};

const bot = mineflayer.createBot(settings);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

var isPlacing = false;
var placingItemName = "";

// Placement function styled directly from your example code
async function placeOnBlock() {
    if (!isPlacing) return;

    try {
        // 1. Get the source block in front of the bot (or find nearby dirt/grass)
        let sourceBlock = bot.blockAtCursor(4);

        if (!sourceBlock || sourceBlock.name === "air") {
            // Fallback: search for nearby dirt/grass blocks within 4 blocks
            sourceBlock = bot.findBlock({
                matching: (b) => b.name === "dirt" || b.name === "grass_block" || b.name === "coarse_dirt",
                maxDistance: 4,
            });
        }

        if (!sourceBlock) {
            console.log("No valid block found to place on!");
            await sleep(500);
            if (isPlacing) placeOnBlock();
            return;
        }

        // 2. Find the requested item in inventory
        const formattedItem = placingItemName.toLowerCase().replace(/\s+/g, "_");
        const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(formattedItem));

        if (!item) {
            bot.chat(`Out of ${placingItemName}! Stopping.`);
            isPlacing = false;
            return;
        }

        // 3. Equip the item to hand
        await bot.equip(item, "hand");

        // 4. Define top face vector {x:0, y:1, z:0} as shown in the tutorial
        let faceVector = vec3(0, 1, 0);

        // 5. Place the block/sapling on top of the source block
        await bot.placeBlock(sourceBlock, faceVector);

    } catch (err) {
        console.log("[Place Error]:", err.message);
    }

    await sleep(400); // Small pause to prevent server spam
    if (isPlacing) placeOnBlock();
}

bot.on("spawn", () => {
    console.log("Bot has joined Shifineyy.aternos.me!");
});

bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

    // Commands: !use oak sapling, !use dirt, !use stop
    if (message.startsWith("!use") || message.startsWith("!place")) {
        let args = message.split(" ").slice(1);
        let input = args.join(" ").replace("item ", "").trim().toLowerCase();

        if (input === "stop" || !input) {
            isPlacing = false;
            bot.chat("Stopped placing.");
            return;
        }

        placingItemName = input;
        isPlacing = true;
        bot.chat(`Starting to place ${placingItemName}...`);
        placeOnBlock();
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);
