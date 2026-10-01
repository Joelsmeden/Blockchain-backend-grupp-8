const fs = require("fs");
const os = require("os");
const path = require("path");


// Kedjefilen är avstängd i test om inte CHAIN_DIR anges. Testerna här
// pekar den mot en tillfällig katalog.

let tmpDir;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chainstore-"));
});

afterEach(() => {
    delete process.env.CHAIN_DIR;
    delete process.env.P2P_PORT;
    fs.rmSync(tmpDir, { recursive: true, force: true });
});


function loadStore(env = {}) {
    Object.assign(process.env, env);
    jest.resetModules();
    return require("../../src/blockchain/chainStore");
}

const doctor = { id: 1, role: "läkare" };


describe("utan CHAIN_DIR i testmiljö", () => {

    test("är avstängd och skriver ingenting", () => {
        const store = loadStore();

        expect(store.isEnabled()).toBe(false);
        expect(store.filePath).toBeNull();
        expect(store.save([{ index: 0 }])).toBe(false);
        expect(store.load()).toBeNull();
        expect(store.clearAll()).toBe(0);
        expect(fs.readdirSync(tmpDir)).toEqual([]);
    });
});


describe("med CHAIN_DIR", () => {

    test("filnamnet innehåller nodens P2P-port", () => {
        const store = loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });

        expect(store.isEnabled()).toBe(true);
        expect(store.filePath).toBe(path.join(tmpDir, "chain-6001.json"));
    });

    test("använder default om P2P_PORT saknas", () => {
        const store = loadStore({ CHAIN_DIR: tmpDir });

        expect(store.filePath).toBe(path.join(tmpDir, "chain-default.json"));
    });

    test("sparar och läser tillbaka kedjan utan att lämna temporär fil", () => {
        const store = loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });
        const chain = [{ index: 0, hash: "a" }, { index: 1, hash: "b", data: { id: 1 } }];

        expect(store.save(chain)).toBe(true);
        expect(fs.readdirSync(tmpDir)).toEqual(["chain-6001.json"]);
        expect(store.load()).toEqual(chain);
    });

    test("skapar katalogen om den saknas", () => {
        const nested = path.join(tmpDir, "a", "b");
        const store = loadStore({ CHAIN_DIR: nested, P2P_PORT: "6001" });

        store.save([{ index: 0 }]);

        expect(fs.existsSync(path.join(nested, "chain-6001.json"))).toBe(true);
    });

    test("ger null när filen saknas", () => {
        const store = loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });

        expect(store.load()).toBeNull();
    });

    test("ger null när filen inte är JSON eller inte är en array", () => {
        const store = loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });

        fs.writeFileSync(store.filePath, "{ trasig");
        expect(store.load()).toBeNull();

        fs.writeFileSync(store.filePath, JSON.stringify({ chain: [] }));
        expect(store.load()).toBeNull();
    });

    test("clearAll tar bort alla noders kedjefiler men inget annat", () => {
        const store = loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });

        fs.writeFileSync(path.join(tmpDir, "chain-6001.json"), "[]");
        fs.writeFileSync(path.join(tmpDir, "chain-6002.json"), "[]");
        fs.writeFileSync(path.join(tmpDir, "patientjournal.db"), "");

        expect(store.clearAll()).toBe(2);
        expect(fs.readdirSync(tmpDir)).toEqual(["patientjournal.db"]);
    });
});


describe("accessLogService och kedjefilen", () => {

    function loadService() {
        require("../../src/database/seed")();
        return require("../../src/services/accessLogService");
    }

    test("skriver kedjan till fil efter varje nytt block", () => {
        const store = loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });
        const service = loadService();

        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        expect(JSON.parse(fs.readFileSync(store.filePath, "utf8"))).toHaveLength(2);

        const { block } = service.recordAccess({ user: doctor, patientId: 2, action: "READ" });
        const saved = JSON.parse(fs.readFileSync(store.filePath, "utf8"));

        expect(saved).toHaveLength(3);
        expect(saved[2].hash).toBe(block.hash);
        expect(saved).toEqual(JSON.parse(JSON.stringify(service.getChain())));
    });

    test("läser in den sparade kedjan vid start", () => {
        loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });
        const service = loadService();
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });
        const latestHash = service.getBlockchain().getLatestBlock().hash;

        // Ny modulinstans, som efter en omstart. Databasen seedas inte
        // här eftersom det skulle räknas som en tom databas och ta bort
        // filen, se nästa describe.
        jest.resetModules();
        const restarted = require("../../src/services/accessLogService");

        expect(restarted.getChain()).toHaveLength(1);
        expect(restarted.loadChain()).toBe(true);
        expect(restarted.getChain()).toHaveLength(3);
        expect(restarted.getBlockchain().getLatestBlock().hash).toBe(latestHash);
        expect(restarted.getBlockchain().isChainValid()).toBe(true);
    });

    test("ignorerar en manipulerad fil och börjar om från genesis", () => {
        const store = loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });
        const service = loadService();
        service.recordAccess({ user: doctor, patientId: 1, action: "READ" });

        const saved = JSON.parse(fs.readFileSync(store.filePath, "utf8"));
        saved[1].data.userId = 5;
        fs.writeFileSync(store.filePath, JSON.stringify(saved));

        jest.resetModules();
        const restarted = require("../../src/services/accessLogService");

        expect(restarted.loadChain()).toBe(false);
        expect(restarted.getChain()).toHaveLength(1);
    });

    test("loadChain ger false när ingen fil finns", () => {
        loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });
        const service = require("../../src/services/accessLogService");

        expect(service.loadChain()).toBe(false);
        expect(service.getChain()).toHaveLength(1);
    });

    test("mottagna block sparas också", () => {
        const store = loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });
        const service = loadService();
        const Blockchain = require("../../src/blockchain/Blockchain");

        const other = new Blockchain();
        const block = JSON.parse(JSON.stringify(other.addBlock({ id: 1, entryHash: "x" })));

        expect(service.receiveBlock(block)).toBe(true);
        expect(JSON.parse(fs.readFileSync(store.filePath, "utf8"))).toHaveLength(2);
    });
});


describe("seed och kedjefiler", () => {

    test("tar bort gamla kedjefiler när en tom databas seedas", () => {
        loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });
        fs.writeFileSync(path.join(tmpDir, "chain-6001.json"), "[]");
        fs.writeFileSync(path.join(tmpDir, "chain-6002.json"), "[]");

        const seed = require("../../src/database/seed");

        expect(seed()).toBe(true);
        expect(fs.readdirSync(tmpDir)).toEqual([]);
    });

    test("lämnar kedjefilerna när databasen redan har data", () => {
        loadStore({ CHAIN_DIR: tmpDir, P2P_PORT: "6001" });
        const seed = require("../../src/database/seed");
        seed();

        fs.writeFileSync(path.join(tmpDir, "chain-6001.json"), "[]");

        expect(seed()).toBe(false);
        expect(fs.readdirSync(tmpDir)).toEqual(["chain-6001.json"]);
    });
});
