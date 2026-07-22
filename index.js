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

// Helper function to get the block directly 1 step IN FRONT of the bot's feet
function getBlockInFront() {
    const yaw = bot.entity.yaw;
    // Calculate 1 block forward in the direction the bot is facing
    const frontX = -Math.sin(yaw);
    const frontZ = -Math.cos(yaw);

    // Block 1 step ahead and 1 block down (the ground block in front)
    const frontPosition = bot.entity.position.offset(frontX, -1, frontZ).floored();
    return bot.blockAt(frontPosition);
}

async function placeOnBlock() {
    if (!isPlacing) return;

    try {
        // 1. Get block at crosshair first
        let sourceBlock = bot.blockAtCursor(4);

        // Position of the block directly under the bot's feet
        const feetBlockPos = bot.entity.position.offset(0, -1, 0).floored();

        // 2. If no block is targeted, or if it accidentally targeted the floor under its feet, target the block IN FRONT instead
        if (!sourceBlock || sourceBlock.name === "air" || sourceBlock.position.equals(feetBlockPos)) {
            sourceBlock = getBlockInFront();
        }

        // Check if a valid block in front exists
        if (!sourceBlock || sourceBlock.name === "air") {
            console.log("No solid block found in front to place on!");
            await sleep(400);
            if (isPlacing) placeOnBlock();
            return;
        }

        // 3. Find item in inventory
        const formattedItem = placingItemName.toLowerCase().replace(/\s+/g, "_");
        const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(formattedItem));

        if (!item) {
            bot.chat(`Out of ${placingItemName}! Stopping.`);
            isPlacing = false;
            return;
        }

        // 4. Equip item to main hand
        await bot.equip(item, "hand");

        // 5. Place on top face of the block IN FRONT (vec3 0,1,0)
        const faceVector = new vec3(0, 1, 0);
        await bot.placeBlock(sourceBlock, faceVector);

    } catch (err) {
        // Ignore minor placement errors if already placed
        if (err.message && !err.message.includes("Cancelled")) {
            console.log("[Place Error]:", err.message);
        }
    }

    await sleep(350); // Pause between placements
    if (isPlacing) placeOnBlock();
}

bot.on("spawn", () => {
    console.log("Bot connected and ready!");
});

bot.on("chat", async (username, message) => {
    if (username === bot.username) return;

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
        bot.chat(`Started placing ${placingItemName} in front!`);
        placeOnBlock();
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);
