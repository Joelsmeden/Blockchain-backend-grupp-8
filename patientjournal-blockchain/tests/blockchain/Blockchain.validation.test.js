const Blockchain = require("../../src/blockchain/Blockchain");
const Block = require("../../src/blockchain/Block");
const { mineBlock } = require("../../src/blockchain/proofOfWork");


// Kompletterar Blockchain.test.js med kontroll av länkning, validering,
// block utifrån och byte av kedja.

const entry = (id) => ({ id, patientId: 1, userId: 4, role: "patient", action: "READ", noteId: null });


function chainWithBlocks(count, firstId = 1) {
    const blockchain = new Blockchain();
    for (let i = 0; i < count; i++) {
        blockchain.addBlock(entry(firstId + i));
    }
    return blockchain;
}


// Ett block som är korrekt i allt utom att hashen inte uppfyller
// svårighetsgraden. Letar upp en nonce vars hash inte börjar med 0.
function unminedNextBlock(blockchain) {
    const previous = blockchain.getLatestBlock();
    let block;
    let nonce = 0;

    do {
        block = new Block({
            index: previous.index + 1,
            timestamp: "2026-10-01T12:00:00.000Z",
            data: entry(99),
            previousHash: previous.hash,
            nonce: nonce++
        });
    } while (block.hash.startsWith("0"));

    return block;
}


describe("genesis", () => {

    test("har index 0, previousHash av 64 nollor och fast tidsstämpel", () => {
        const genesis = new Blockchain().chain[0];

        expect(genesis.index).toBe(0);
        expect(genesis.previousHash).toBe("0".repeat(64));
        expect(typeof genesis.timestamp).toBe("string");
        expect(genesis.hash).toBe(Block.computeHash(genesis));
    });

    test("är identiskt för två kedjor skapade vid olika tillfällen", async () => {
        const first = new Blockchain().chain[0];
        await new Promise(resolve => setTimeout(resolve, 5));
        const second = new Blockchain().chain[0];

        expect(second).toEqual(first);
        expect(second.hash).toBe(first.hash);
    });

    test("är fryst", () => {
        expect(Object.isFrozen(new Blockchain().chain[0])).toBe(true);
    });
});


describe("addBlock", () => {

    test("länkar till föregående block och ökar index", () => {
        const blockchain = chainWithBlocks(2);
        const [genesis, first, second] = blockchain.chain;

        expect(first.index).toBe(1);
        expect(first.previousHash).toBe(genesis.hash);
        expect(second.index).toBe(2);
        expect(second.previousHash).toBe(first.hash);
    });

    test("lagrar data, minar enligt svårighetsgraden och fryser blocket", () => {
        const blockchain = new Blockchain();
        const block = blockchain.addBlock(entry(1));

        expect(block.data).toEqual(entry(1));
        expect(block.hash.startsWith("0".repeat(blockchain.difficulty))).toBe(true);
        expect(Object.isFrozen(block)).toBe(true);
        expect(blockchain.getLatestBlock()).toBe(block);
    });

    test("svårighetsgraden är 1 i test", () => {
        expect(new Blockchain().difficulty).toBe(1);
    });
});


describe("isChainValid", () => {

    test("godkänner en orörd kedja", () => {
        expect(chainWithBlocks(3).isChainValid()).toBe(true);
    });

    test("godkänner en kedja med bara genesis", () => {
        expect(new Blockchain().isChainValid()).toBe(true);
    });

    test("underkänner ett block vars data ändrats", () => {
        const blockchain = chainWithBlocks(3);
        const tampered = blockchain.chain[2];

        blockchain.chain[2] = { ...tampered, data: { ...tampered.data, action: "WRITE" } };

        expect(blockchain.isChainValid()).toBe(false);
    });

    test("underkänner ett ändrat block även om hashen räknats om", () => {
        const blockchain = chainWithBlocks(3);
        const original = blockchain.chain[1];
        const changed = { ...original, data: { ...original.data, userId: 1 } };

        blockchain.chain[1] = mineBlock(changed, blockchain.difficulty);

        // Blocket är giltigt i sig, men nästa block pekar på den gamla hashen
        expect(blockchain.isValidNextBlock(blockchain.chain[1], blockchain.chain[0])).toBe(true);
        expect(blockchain.isChainValid()).toBe(false);
    });

    test("underkänner en kedja där ett block tagits bort i mitten", () => {
        const blockchain = chainWithBlocks(3);

        blockchain.chain.splice(2, 1);

        expect(blockchain.isChainValid()).toBe(false);
    });

    test("underkänner en kedja med annat genesis", () => {
        const blockchain = chainWithBlocks(1);
        const foreign = [
            Block.freeze(new Block({ index: 0, timestamp: "2000-01-01T00:00:00.000Z", data: "Annat", previousHash: "0".repeat(64) })),
            ...blockchain.chain.slice(1)
        ];

        expect(blockchain.isChainValid(foreign)).toBe(false);
    });

    test("underkänner tom eller ogiltig kedja", () => {
        const blockchain = new Blockchain();

        expect(blockchain.isChainValid([])).toBe(false);
        expect(blockchain.isChainValid(null)).toBe(false);
        expect(blockchain.isChainValid("kedja")).toBe(false);
    });
});


describe("isValidNextBlock", () => {

    test("godkänner ett korrekt nästa block", () => {
        const blockchain = chainWithBlocks(1);
        const other = chainWithBlocks(1);
        const candidate = other.addBlock(entry(2));

        // Samma genesis och samma första block ger samma previousHash bara om
        // blocken är identiska, vilket de inte är på grund av tidsstämpeln.
        // Bygg därför kandidaten mot vår egen kedja i stället.
        const previous = blockchain.getLatestBlock();
        const block = mineBlock(new Block({
            index: previous.index + 1,
            timestamp: candidate.timestamp,
            data: entry(2),
            previousHash: previous.hash
        }), blockchain.difficulty);

        expect(blockchain.isValidNextBlock(block)).toBe(true);
    });

    test("underkänner fel index", () => {
        const blockchain = chainWithBlocks(1);
        const previous = blockchain.getLatestBlock();
        const block = mineBlock(new Block({
            index: previous.index + 2,
            timestamp: "2026-10-01T12:00:00.000Z",
            data: entry(2),
            previousHash: previous.hash
        }), blockchain.difficulty);

        expect(blockchain.isValidNextBlock(block)).toBe(false);
    });

    test("underkänner fel previousHash", () => {
        const blockchain = chainWithBlocks(1);
        const previous = blockchain.getLatestBlock();
        const block = mineBlock(new Block({
            index: previous.index + 1,
            timestamp: "2026-10-01T12:00:00.000Z",
            data: entry(2),
            previousHash: "f".repeat(64)
        }), blockchain.difficulty);

        expect(blockchain.isValidNextBlock(block)).toBe(false);
    });

    test("underkänner en hash som inte stämmer med innehållet", () => {
        const blockchain = chainWithBlocks(1);
        const previous = blockchain.getLatestBlock();
        const block = mineBlock(new Block({
            index: previous.index + 1,
            timestamp: "2026-10-01T12:00:00.000Z",
            data: entry(2),
            previousHash: previous.hash
        }), blockchain.difficulty);

        expect(blockchain.isValidNextBlock({ ...block, data: entry(3) })).toBe(false);
    });

    test("underkänner en hash som inte uppfyller svårighetsgraden", () => {
        const blockchain = chainWithBlocks(1);
        const block = unminedNextBlock(blockchain);

        expect(Block.computeHash(block)).toBe(block.hash);
        expect(blockchain.isValidNextBlock(block)).toBe(false);
    });

    test("underkänner något som inte är ett block", () => {
        const blockchain = new Blockchain();

        expect(blockchain.isValidNextBlock(null)).toBe(false);
        expect(blockchain.isValidNextBlock(undefined)).toBe(false);
        expect(blockchain.isValidNextBlock("block")).toBe(false);
    });
});


describe("appendBlock", () => {

    test("lägger till ett giltigt block som kommit som JSON och returnerar true", () => {
        const blockchain = chainWithBlocks(1);
        const previous = blockchain.getLatestBlock();
        const mined = mineBlock(new Block({
            index: previous.index + 1,
            timestamp: "2026-10-01T12:00:00.000Z",
            data: entry(2),
            previousHash: previous.hash
        }), blockchain.difficulty);
        const fromNetwork = JSON.parse(JSON.stringify(mined));

        expect(blockchain.appendBlock(fromNetwork)).toBe(true);
        expect(blockchain.chain.length).toBe(3);
        expect(blockchain.getLatestBlock().hash).toBe(mined.hash);
        expect(blockchain.getLatestBlock()).toBeInstanceOf(Block);
        expect(Object.isFrozen(blockchain.getLatestBlock())).toBe(true);
        expect(blockchain.isChainValid()).toBe(true);
    });

    test("avvisar ett ogiltigt block och lämnar kedjan orörd", () => {
        const blockchain = chainWithBlocks(1);
        const before = [...blockchain.chain];

        expect(blockchain.appendBlock(unminedNextBlock(blockchain))).toBe(false);
        expect(blockchain.appendBlock({ ...blockchain.getLatestBlock() })).toBe(false);
        expect(blockchain.chain).toEqual(before);
    });
});


describe("replaceChain", () => {

    test("byter till en längre giltig kedja", () => {
        const ours = chainWithBlocks(1);
        const theirs = chainWithBlocks(3);
        const incoming = JSON.parse(JSON.stringify(theirs.chain));

        expect(ours.replaceChain(incoming)).toBe(true);
        expect(ours.chain.length).toBe(4);
        expect(ours.getLatestBlock().hash).toBe(theirs.getLatestBlock().hash);
        expect(ours.chain.every(block => block instanceof Block && Object.isFrozen(block))).toBe(true);
        expect(ours.isChainValid()).toBe(true);
    });

    test("lika långa kedjor avgörs av lägst sista hash, åt båda hållen", () => {
        const first = chainWithBlocks(2);
        const second = chainWithBlocks(2, 10);   // andra poster, alltså andra hashar
        expect(first.getLatestBlock().hash).not.toBe(second.getLatestBlock().hash);

        const [low, high] = first.getLatestBlock().hash < second.getLatestBlock().hash
            ? [first, second]
            : [second, first];
        const lowChain = JSON.parse(JSON.stringify(low.chain));
        const highChain = JSON.parse(JSON.stringify(high.chain));

        // Den med lägst sista hash behåller sin kedja
        const before = low.chain;
        expect(low.replaceChain(highChain)).toBe(false);
        expect(low.chain).toBe(before);

        // Den med högst byter, så båda hamnar på samma kedja
        expect(high.replaceChain(lowChain)).toBe(true);
        expect(high.getLatestBlock().hash).toBe(low.getLatestBlock().hash);
        expect(high.isChainValid()).toBe(true);
    });

    test("behåller egen kedja om den inkommande är identisk", () => {
        const ours = chainWithBlocks(2);
        const before = ours.chain;

        expect(ours.replaceChain(JSON.parse(JSON.stringify(ours.chain)))).toBe(false);
        expect(ours.chain).toBe(before);
    });

    test("behåller egen kedja om den inkommande är kortare", () => {
        const ours = chainWithBlocks(3);
        const theirs = chainWithBlocks(1);
        const before = ours.chain;

        expect(ours.replaceChain(theirs.chain)).toBe(false);
        expect(ours.chain).toBe(before);
    });

    test("behåller egen kedja om den inkommande är längre men ogiltig", () => {
        const ours = chainWithBlocks(1);
        const theirs = chainWithBlocks(3);
        const tampered = JSON.parse(JSON.stringify(theirs.chain));
        tampered[2].data.action = "WRITE";
        const before = ours.chain;

        expect(ours.replaceChain(tampered)).toBe(false);
        expect(ours.chain).toBe(before);
    });

    test("avvisar något som inte är en kedja", () => {
        const ours = new Blockchain();

        expect(ours.replaceChain(null)).toBe(false);
        expect(ours.replaceChain("kedja")).toBe(false);
        expect(ours.replaceChain([])).toBe(false);
    });
});
