const Block = require("./Block");
const { getDifficulty, hashMeetsDifficulty, mineBlock } = require("./proofOfWork");


// Genesis-blocket måste vara exakt likadant på alla noder, annars har de
// olika kedjor från start och kan aldrig synka. Därför fast tidsstämpel.
const GENESIS = Block.freeze(new Block({
    index: 0,
    timestamp: "2026-10-01T00:00:00.000Z",
    data: "Genesis",
    previousHash: "0".repeat(64),
    nonce: 0
}));


class Blockchain {

    constructor({ difficulty = getDifficulty() } = {}) {
        this.difficulty = difficulty;
        this.chain = [GENESIS];
    }


    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }


    // Skapar och minar ett nytt block med given data och lägger det sist
    // Bygger och minar nästa block utan att lägga till det i kedjan, så
    // att den som anropar kan spara blockets hash först och lägga till
    // blocket med appendBlock när det är gjort.
    mineNextBlock(data) {

        const previous = this.getLatestBlock();

        const block = new Block({
            index: previous.index + 1,
            timestamp: new Date().toISOString(),
            data,
            previousHash: previous.hash
        });

        return mineBlock(block, this.difficulty);
    }


    addBlock(data) {

        const block = this.mineNextBlock(data);
        this.chain.push(block);

        return block;
    }


    // Kontrollerar att ett block passar direkt efter previous. Används
    // både för egna block och för block som kommer från andra noder.
    isValidNextBlock(block, previous = this.getLatestBlock()) {

        if (!block || typeof block !== "object") {
            return false;
        }

        if (block.index !== previous.index + 1) {
            return false;
        }

        if (block.previousHash !== previous.hash) {
            return false;
        }

        if (Block.computeHash(block) !== block.hash) {
            return false;
        }

        return hashMeetsDifficulty(block.hash, this.difficulty);
    }


    // Lägger till ett block utifrån. Returnerar true om det lades till.
    appendBlock(block) {

        if (!this.isValidNextBlock(block)) {
            return false;
        }

        this.chain.push(Block.freeze(new Block(block)));

        return true;
    }


    isChainValid(chain = this.chain) {

        if (!Array.isArray(chain) || chain.length === 0) {
            return false;
        }

        // Första blocket ska vara vårt genesis, fält för fält
        const first = chain[0];

        if (first.hash !== GENESIS.hash || Block.computeHash(first) !== GENESIS.hash) {
            return false;
        }

        for (let i = 1; i < chain.length; i++) {
            if (!this.isValidNextBlock(chain[i], chain[i - 1])) {
                return false;
            }
        }

        return true;
    }


    // Byter till en annan kedja bara om den är längre och giltig.
    // Returnerar true om bytet gjordes.
    replaceChain(newChain) {

        if (!Array.isArray(newChain) || newChain.length <= this.chain.length) {
            return false;
        }

        if (!this.isChainValid(newChain)) {
            return false;
        }

        this.chain = newChain.map(block => Block.freeze(new Block(block)));

        return true;
    }
}


module.exports = Blockchain;
