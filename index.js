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
        } catch (err) {}
    }
    
    await sleep(100);
    if (isDigging) dig();
}

// ---------------------------------------------------------
// NEW & IMPROVED PLACING LOGIC
// ---------------------------------------------------------
async function place() {
    if (!isPlacing) return;

    try {
        const formattedTarget = placingItemName.toLowerCase().replace(/\s+/g, "_");

        // 1. Find item
        const item = bot.inventory.items().find((i) => i.name.toLowerCase().includes(formattedTarget));

        if (!item) {
            bot.chat(`I don't have ${placingItemName} anymore! Stopping.`);
            isPlacing = false;
            return;
        }

        // 2. Equip item safely
        if (!bot.heldItem || bot.heldItem.name !== item.name) {
            await bot.equip(item, "hand");
            await sleep(250); // Mandatory wait for server to register equip
        }

        // 3. Find block in front of the bot
        const targetBlock = bot.blockAtCursor(4);

        if (targetBlock && targetBlock.name !== "air") {
            
            // 4. Force the bot to look directly at the center of the block to satisfy server Anti-Cheat
            const centerPosition = targetBlock.position.offset(0.5, 0.5, 0.5);
            await bot.lookAt(centerPosition, true);
            await sleep(50); // Tiny pause to let the head turn

            // 5. Place the block on the TOP face (vec3 0,1,0) of the target block
            // This means if you look at a dirt block, it plants the sapling ON TOP of it.
            await bot.placeBlock(targetBlock, new vec3(0, 1, 0));
            
            // 6. Swing arm to make it look like a real player clicking
            bot.swingArm('right');
        }

    } catch (err) {
        // If it fails, print the exact reason to your terminal!
        console.log(`[Placing Block Failed]: ${err.message}`);
    }

    // Wait half a second between placements so the server doesn't kick for spamming
    await sleep(500);

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
    console.log(`Bot has spawned in the server! Type commands in chat.`);
});

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
