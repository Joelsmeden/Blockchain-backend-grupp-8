const { sha256, canonicalStringify } = require("./crypto");


// Fryser ett objekt och allt det innehåller
function deepFreeze(value) {

    if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.keys(value).forEach(key => deepFreeze(value[key]));
    }

    return value;
}


class Block {

    constructor({ index, timestamp, data, previousHash, nonce = 0, hash }) {
        this.index = index;
        this.timestamp = timestamp;
        this.data = data;
        this.previousHash = previousHash;
        this.nonce = nonce;
        this.hash = hash || Block.computeHash(this);
    }


    // Statisk, så att den fungerar på vilket objekt som helst med rätt
    // fält. Block som kommer från en annan nod är vanliga JSON-objekt
    // utan metoder, och deras hash måste kunna räknas om ändå.
    static computeHash({ index, previousHash, timestamp, data, nonce }) {

        const payload = [
            index,
            previousHash,
            timestamp,
            canonicalStringify(data),
            nonce
        ].join("|");

        return sha256(payload);
    }


    // Fryser blocket och dess data så att det inte kan ändras efteråt
    static freeze(block) {
        deepFreeze(block.data);
        return Object.freeze(block);
    }
}


module.exports = Block;
