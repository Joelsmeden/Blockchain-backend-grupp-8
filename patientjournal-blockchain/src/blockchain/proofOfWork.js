const Block = require("./Block");


const DEFAULT_DIFFICULTY = 2;


// Antal nollor hashen måste börja med. Läses från miljövariabeln
// DIFFICULTY. I test tvingas den till 1 så att sviten inte tar tid.
// Båda noderna måste köra med samma värde, annars underkänner de
// varandras block.
function getDifficulty() {

    if (process.env.NODE_ENV === "test") {
        return 1;
    }

    const value = parseInt(process.env.DIFFICULTY, 10);

    return Number.isInteger(value) && value >= 0 ? value : DEFAULT_DIFFICULTY;
}


function hashMeetsDifficulty(hash, difficulty) {
    return typeof hash === "string" && hash.startsWith("0".repeat(difficulty));
}


// Ökar nonce tills hashen uppfyller svårighetsgraden. Blocket ändras på
// plats, fryses och returneras.
function mineBlock(block, difficulty = getDifficulty()) {

    block.hash = Block.computeHash(block);

    while (!hashMeetsDifficulty(block.hash, difficulty)) {
        block.nonce += 1;
        block.hash = Block.computeHash(block);
    }

    return Block.freeze(block);
}


module.exports = {
    DEFAULT_DIFFICULTY,
    getDifficulty,
    hashMeetsDifficulty,
    mineBlock
};
