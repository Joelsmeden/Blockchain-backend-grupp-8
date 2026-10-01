const Block = require("../../src/blockchain/Block");
const { sha256, canonicalStringify } = require("../../src/blockchain/crypto");


const fields = {
    index: 1,
    timestamp: "2026-10-01T12:00:00.000Z",
    data: { patientId: 1, userId: 4, action: "READ" },
    previousHash: "a".repeat(64),
    nonce: 0
};


describe("Block", () => {

    test("sätter alla fält och räknar ut hash om ingen anges", () => {
        const block = new Block(fields);

        expect(block.index).toBe(1);
        expect(block.timestamp).toBe(fields.timestamp);
        expect(block.data).toEqual(fields.data);
        expect(block.previousHash).toBe(fields.previousHash);
        expect(block.nonce).toBe(0);
        expect(block.hash).toBe(Block.computeHash(fields));
    });

    test("behåller en angiven hash", () => {
        const block = new Block({ ...fields, hash: "given" });

        expect(block.hash).toBe("given");
    });

    test("nonce är 0 om inget anges", () => {
        const { nonce, ...withoutNonce } = fields;

        expect(new Block(withoutNonce).nonce).toBe(0);
    });
});


describe("Block.computeHash", () => {

    test("är deterministisk", () => {
        expect(Block.computeHash(fields)).toBe(Block.computeHash({ ...fields }));
    });

    test("ger 64 hexadecimala tecken", () => {
        expect(Block.computeHash(fields)).toMatch(/^[0-9a-f]{64}$/);
    });

    test("använder payloaden index|previousHash|timestamp|data|nonce", () => {
        const payload = [
            fields.index,
            fields.previousHash,
            fields.timestamp,
            canonicalStringify(fields.data),
            fields.nonce
        ].join("|");

        expect(Block.computeHash(fields)).toBe(sha256(payload));
    });

    test("ger ny hash när data ändras", () => {
        const changed = { ...fields, data: { ...fields.data, action: "WRITE" } };

        expect(Block.computeHash(changed)).not.toBe(Block.computeHash(fields));
    });

    test.each([
        ["index", 2],
        ["timestamp", "2026-10-01T12:00:01.000Z"],
        ["previousHash", "b".repeat(64)],
        ["nonce", 1]
    ])("ger ny hash när %s ändras", (field, value) => {
        expect(Block.computeHash({ ...fields, [field]: value })).not.toBe(Block.computeHash(fields));
    });

    test("ger samma hash oavsett fältordning i data", () => {
        const reordered = { ...fields, data: { action: "READ", userId: 4, patientId: 1 } };

        expect(Block.computeHash(reordered)).toBe(Block.computeHash(fields));
    });

    test("fungerar på ett vanligt objekt som gått via JSON, inte bara klassinstanser", () => {
        const block = new Block(fields);
        const fromNetwork = JSON.parse(JSON.stringify(block));

        expect(fromNetwork instanceof Block).toBe(false);
        expect(Block.computeHash(fromNetwork)).toBe(block.hash);
    });

    test("påverkas inte av extra fält, bara de fem som ingår i payloaden", () => {
        expect(Block.computeHash({ ...fields, hash: "x", annat: 1 })).toBe(Block.computeHash(fields));
    });
});


describe("Block.freeze", () => {

    test("fryser blocket och dess data", () => {
        const block = Block.freeze(new Block(fields));

        expect(Object.isFrozen(block)).toBe(true);
        expect(Object.isFrozen(block.data)).toBe(true);
    });

    test("ändringar efteråt får ingen effekt", () => {
        const block = Block.freeze(new Block(fields));

        expect(() => { "use strict"; block.nonce = 99; }).toThrow(TypeError);
        expect(() => { "use strict"; block.data.action = "WRITE"; }).toThrow(TypeError);
        expect(block.nonce).toBe(0);
        expect(block.data.action).toBe("READ");
    });

    test("returnerar samma objekt", () => {
        const block = new Block(fields);

        expect(Block.freeze(block)).toBe(block);
    });
});
