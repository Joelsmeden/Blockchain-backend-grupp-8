const Block = require("../../src/blockchain/Block");
const {
    DEFAULT_DIFFICULTY,
    getDifficulty,
    hashMeetsDifficulty,
    mineBlock
} = require("../../src/blockchain/proofOfWork");


function newBlock() {
    return new Block({
        index: 1,
        timestamp: "2026-10-01T12:00:00.000Z",
        data: { patientId: 1, userId: 4, action: "READ" },
        previousHash: "a".repeat(64)
    });
}


describe("getDifficulty", () => {

    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    test("tvingas till 1 när NODE_ENV är test, oavsett DIFFICULTY", () => {
        process.env.NODE_ENV = "test";
        process.env.DIFFICULTY = "5";

        expect(getDifficulty()).toBe(1);
    });

    test("läser DIFFICULTY från miljön utanför test", () => {
        process.env.NODE_ENV = "development";
        process.env.DIFFICULTY = "3";

        expect(getDifficulty()).toBe(3);
    });

    test("faller tillbaka på standardvärdet om DIFFICULTY saknas eller är ogiltig", () => {
        process.env.NODE_ENV = "development";

        delete process.env.DIFFICULTY;
        expect(getDifficulty()).toBe(DEFAULT_DIFFICULTY);

        process.env.DIFFICULTY = "abc";
        expect(getDifficulty()).toBe(DEFAULT_DIFFICULTY);

        process.env.DIFFICULTY = "-1";
        expect(getDifficulty()).toBe(DEFAULT_DIFFICULTY);
    });
});


describe("hashMeetsDifficulty", () => {

    test("kräver rätt antal inledande nollor", () => {
        expect(hashMeetsDifficulty("000abc", 3)).toBe(true);
        expect(hashMeetsDifficulty("000abc", 4)).toBe(false);
        expect(hashMeetsDifficulty("00abc", 3)).toBe(false);
    });

    test("svårighetsgrad 0 godkänner alla hashar", () => {
        expect(hashMeetsDifficulty("fff", 0)).toBe(true);
    });

    test("underkänner något som inte är en sträng", () => {
        expect(hashMeetsDifficulty(undefined, 1)).toBe(false);
        expect(hashMeetsDifficulty(null, 1)).toBe(false);
    });
});


describe("mineBlock", () => {

    test("ger en hash som börjar med rätt antal nollor", () => {
        const block = mineBlock(newBlock(), 3);

        expect(block.hash.startsWith("000")).toBe(true);
    });

    test("hashen stämmer med blockets fält efter mining", () => {
        const block = mineBlock(newBlock(), 2);

        expect(Block.computeHash(block)).toBe(block.hash);
    });

    test("ökar nonce tills villkoret är uppfyllt", () => {
        const block = mineBlock(newBlock(), 2);

        expect(Number.isInteger(block.nonce)).toBe(true);
        expect(block.nonce).toBeGreaterThan(0);

        // Alla nonce-värden före det funna ska ha gett en för dålig hash
        for (let nonce = 0; nonce < block.nonce; nonce++) {
            const hash = Block.computeHash({ ...block, nonce });
            expect(hash.startsWith("00")).toBe(false);
        }
    });

    test("använder svårighetsgraden från miljön om ingen anges", () => {
        const block = mineBlock(newBlock());

        expect(block.hash.startsWith("0".repeat(getDifficulty()))).toBe(true);
    });

    test("ändrar blocket på plats och returnerar det", () => {
        const block = newBlock();

        expect(mineBlock(block, 1)).toBe(block);
    });

    test("fryser blocket efter mining", () => {
        const block = mineBlock(newBlock(), 1);

        expect(Object.isFrozen(block)).toBe(true);
        expect(Object.isFrozen(block.data)).toBe(true);
    });

    test("är deterministisk för samma block och svårighetsgrad", () => {
        const a = mineBlock(newBlock(), 2);
        const b = mineBlock(newBlock(), 2);

        expect(a.nonce).toBe(b.nonce);
        expect(a.hash).toBe(b.hash);
    });

    test("fungerar på ett vanligt objekt utan metoder", () => {
        const plain = JSON.parse(JSON.stringify(newBlock()));
        const block = mineBlock(plain, 2);

        expect(block.hash.startsWith("00")).toBe(true);
        expect(Block.computeHash(block)).toBe(block.hash);
    });
});
