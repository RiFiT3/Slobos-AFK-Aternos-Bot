const mineflayer = require("mineflayer");
const vec3 = require("vec3");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const prefix = "!";

var isDigging = false;
var isPlacing = false;
var placingItemName = "";

const bot = mineflayer.createBot({
    host: "Obsidian7_smp.aternos.me",
    port: 11400,
    username: "consistentMiner",
    // auth: "microsoft", // Uncomment if logging into an online-mode / Microsoft account
    skipValidation: true,
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
            await sleep(100);
        }
    }
    
    dig();
}

// Recursive loop for placing blocks/saplings
async function place() {
    if (!isPlacing) return;
    
    const block = bot.blockAtCursor(4);

    if (!block) {
        await sleep(100);
    } else {
        try {
            // Find item in inventory
            const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(placingItemName));
            
            if (!item) {
                bot.chat(`Out of ${placingItemName}! Stopping placement.`);
                isPlacing = false;
                return;
            }

            // Equip item to main hand
            await bot.equip(item, "hand");

            // Place on top face of target block (vec3(0, 1, 0))
            await bot.placeBlock(block, vec3(0, 1, 0));
        } catch (err) {
            // Small pause if placement fails (e.g., target block obstructed)
            await sleep(100);
        }
    }
    
    place();
}

function equip(itemName) {
    const item = bot.inventory.items().filter((item) => item.name.toLowerCase().includes(itemName.toLowerCase()))[0];
    if (item) {
        bot.equip(item, "hand");
        bot.chat(`I equipped a ${itemName}!`);
        return true;
    } else {
        bot.chat(`I don't have a ${itemName}!`);
        return false;
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

        placingItemName = fullInput.replace(/\s+/g, "_");

        bot.chat(`Started placing ${placingItemName}!`);
        isPlacing = true;
        place();

    } else if (command === "equip") {
        if (args.length < 1) {
            bot.chat("You must specify an item name!");
            return;
        }

        equip(args.join(" "));
    } else {
        bot.chat("I don't understand you!");
    }
});

bot.on("kicked", console.log);
bot.on("error", console.log);

