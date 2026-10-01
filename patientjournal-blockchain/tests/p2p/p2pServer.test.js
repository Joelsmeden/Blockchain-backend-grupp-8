const fs = require("fs");
const os = require("os");
const path = require("path");
const WebSocket = require("ws");
const Blockchain = require("../../src/blockchain/Blockchain");
const { MESSAGE_TYPES } = require("../../src/p2p/p2pServer");


// Riktiga noder i samma process. Varje nod får egna moduler med egen
// databas i minnet, egen kedja och egen P2P-server på en ledig port.
// Databaserna delas alltså inte här, så det som kontrolleras är kedjan.

jest.setTimeout(15000);

const doctor = { id: 1, role: "läkare" };

let nodes = [];

afterEach(async () => {
    await Promise.all(nodes.map(node => node.p2p && node.p2p.stop()));
    nodes = [];
});


function createNode() {

    const node = {};

    jest.isolateModules(() => {
        require("../../src/database/seed")();
        node.service = require("../../src/services/accessLogService");
        node.model = require("../../src/models/accessLogModel");
        node.createP2PServer = require("../../src/p2p/p2pServer").createP2PServer;
    });

    node.start = async (options = {}) => {
        node.p2p = node.createP2PServer({
            port: 0,
            ledger: node.service,
            log: () => {},
            reconnectInterval: 100,
            ...options
        });
        await node.p2p.start();
        nodes.push(node);
        return node;
    };

    node.url = () => `ws://localhost:${node.p2p.port}`;
    node.record = (patientId = 1) => node.service.recordAccess({ user: doctor, patientId, action: "READ" });
    node.chain = () => node.service.getChain();
    node.latestHash = () => node.service.getBlockchain().getLatestBlock().hash;
    node.entryHashes = () => node.chain().slice(1).map(block => block.data.entryHash).sort();

    return node;
}


async function waitFor(check, description, timeout = 5000) {

    const start = Date.now();

    while (!check()) {
        if (Date.now() - start > timeout) {
            throw new Error(`Väntade förgäves på: ${description}`);
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

const connected = (...list) => list.every(node => node.p2p.getPeerCount() >= 1);
const sameChain = (a, b) => a.chain().length === b.chain().length && a.latestHash() === b.latestHash();
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));


describe("anslutning", () => {

    test("en nod utan peers har inga anslutningar", async () => {
        const a = await createNode().start();

        expect(a.p2p.getPeerCount()).toBe(0);
        expect(a.p2p.port).toBeGreaterThan(0);
    });

    test("en nod ansluter till sin peer och båda ser varandra", async () => {
        const a = await createNode().start();
        const b = await createNode().start({ peers: [a.url()] });

        await waitFor(() => connected(a, b), "anslutning");

        expect(a.p2p.getPeerCount()).toBe(1);
        expect(b.p2p.getPeerCount()).toBe(1);
    });

    test("återansluter när peern försvinner och kommer tillbaka", async () => {
        const a = await createNode().start();
        const port = a.p2p.port;
        const b = await createNode().start({ peers: [a.url()] });
        await waitFor(() => connected(a, b), "första anslutningen");

        await a.p2p.stop();
        await waitFor(() => b.p2p.getPeerCount() === 0, "frånkoppling");

        const a2 = await createNode().start({ port });
        await waitFor(() => connected(a2, b), "återanslutning");

        // Och block flödar igen
        a2.record();
        await waitFor(() => sameChain(a2, b), "synk efter återanslutning");
    });

    test("fortsätter försöka när peern inte finns alls", async () => {
        const b = await createNode().start({ peers: ["ws://localhost:1"] });

        await pause(350);

        expect(b.p2p.getPeerCount()).toBe(0);
        await expect(b.p2p.stop()).resolves.toBeUndefined();
    });
});


describe("spridning av block", () => {

    test("ett block som minas på A dyker upp på B", async () => {
        const a = await createNode().start();
        const b = await createNode().start({ peers: [a.url()] });
        await waitFor(() => connected(a, b), "anslutning");

        const { block } = a.record();

        await waitFor(() => b.chain().length === 2, "blocket på B");
        expect(b.latestHash()).toBe(block.hash);
        expect(b.chain()[1].data).toEqual(block.data);
    });

    test("block går åt båda hållen", async () => {
        const a = await createNode().start();
        const b = await createNode().start({ peers: [a.url()] });
        await waitFor(() => connected(a, b), "anslutning");

        a.record();
        await waitFor(() => sameChain(a, b), "A till B");

        b.record(2);
        await waitFor(() => sameChain(a, b) && a.chain().length === 3, "B till A");

        expect(a.chain()[2].data.patientId).toBe(2);
    });

    test("flera block i snabb följd kommer fram i ordning", async () => {
        const a = await createNode().start();
        const b = await createNode().start({ peers: [a.url()] });
        await waitFor(() => connected(a, b), "anslutning");

        for (let i = 0; i < 5; i++) {
            a.record();
        }

        await waitFor(() => sameChain(a, b) && b.chain().length === 6, "fem block på B");
        expect(JSON.parse(JSON.stringify(b.chain()))).toEqual(JSON.parse(JSON.stringify(a.chain())));
        expect(b.service.getBlockchain().isChainValid()).toBe(true);
    });

    test("en nod som ansluter sent hämtar hela kedjan", async () => {
        const a = await createNode().start();
        a.record();
        a.record();
        a.record();

        const c = await createNode().start({ peers: [a.url()] });

        await waitFor(() => sameChain(a, c), "hela kedjan på C");
        expect(c.chain()).toHaveLength(4);
        expect(c.service.getBlockchain().isChainValid()).toBe(true);
    });

    test("tre noder i rad: block från A når C via B", async () => {
        const a = await createNode().start();
        const b = await createNode().start({ peers: [a.url()] });
        const c = await createNode().start({ peers: [b.url()] });
        await waitFor(() => a.p2p.getPeerCount() === 1 && b.p2p.getPeerCount() === 2 && c.p2p.getPeerCount() === 1, "kedjan A-B-C");

        a.record();

        await waitFor(() => sameChain(a, c) && sameChain(a, b), "blocket på C");
        expect(c.chain()).toHaveLength(2);
    });

    test("mottagna block får origin remote i händelsen", async () => {
        const a = await createNode().start();
        const b = await createNode().start({ peers: [a.url()] });
        await waitFor(() => connected(a, b), "anslutning");

        const listener = jest.fn();
        b.service.events.on("block", listener);

        a.record();

        await waitFor(() => listener.mock.calls.length === 1, "händelsen på B");
        expect(listener.mock.calls[0][0]).toMatchObject({ origin: "remote" });
    });
});


describe("fork", () => {

    test("när två noder minat var sitt block med samma index vinner längsta kedjan och den förlorande posten minas om", async () => {
        const a = await createNode().start();
        const b = await createNode().start({ peers: [a.url()] });
        await waitFor(() => connected(a, b), "anslutning");

        const shared = a.record();
        await waitFor(() => sameChain(a, b), "gemensam start");

        // Bryt anslutningen och låt båda arbeta vidare var för sig
        await b.p2p.stop();
        await waitFor(() => a.p2p.getPeerCount() === 0, "frånkoppling");

        const aEntry = a.record(2);          // A: index 2
        const bFirst = b.record(3);          // B: index 2
        const bSecond = b.record(3);         // B: index 3, B:s kedja är längre

        expect(a.chain()).toHaveLength(3);
        expect(b.chain()).toHaveLength(4);
        expect(a.chain()[2].index).toBe(b.chain()[2].index);
        expect(a.latestHash()).not.toBe(b.latestHash());

        // Återanslut
        b.p2p = b.createP2PServer({ port: 0, peers: [a.url()], ledger: b.service, log: () => {}, reconnectInterval: 100 });
        await b.p2p.start();

        await waitFor(() => sameChain(a, b) && a.chain().length === 5, "konvergens med omminerad post");

        // Alla fyra poster finns på båda noderna
        const expected = [
            shared.entry.entryHash,
            aEntry.entry.entryHash,
            bFirst.entry.entryHash,
            bSecond.entry.entryHash
        ].sort();
        expect(a.entryHashes()).toEqual(expected);
        expect(b.entryHashes()).toEqual(expected);

        // A:s post ligger sist, i ett nytt block, och raden pekar på det
        const remined = a.chain()[4];
        expect(remined.data).toEqual(aEntry.block.data);
        expect(remined.hash).not.toBe(aEntry.block.hash);
        expect(a.model.findById(aEntry.entry.id).blockHash).toBe(remined.hash);
        expect(a.service.verifyEntry(a.model.findById(aEntry.entry.id))).toBe(true);

        expect(a.service.getBlockchain().isChainValid()).toBe(true);
        expect(b.service.getBlockchain().isChainValid()).toBe(true);
    });

    test("en kortare kedja ersätter inte en längre", async () => {
        const a = await createNode().start();
        a.record();
        a.record();
        const hashBefore = a.latestHash();

        const b = await createNode().start();
        b.record();

        // B ansluter med sin kortare kedja
        b.p2p.connectToPeer(a.url());

        await waitFor(() => sameChain(a, b), "B tar A:s kedja");

        expect(a.chain()).toHaveLength(4);     // A:s två plus B:s omminerade
        expect(a.chain()[2].hash).toBe(hashBefore);
    });

    test("två noder som minat var sitt block med samma index konvergerar till samma kedja, oavsett vem som vinner", async () => {

        // Här delar noderna databas, som i drift, så att verifieringen kan
        // kontrollera alla rader mot kedjan på båda
        const dbPath = path.join(os.tmpdir(), `p2p-fork-${process.pid}-${Date.now()}.db`);
        const previousDbPath = process.env.DB_PATH;
        process.env.DB_PATH = dbPath;

        let nodeA;
        let nodeB;

        try {
            nodeA = createNode();
            nodeB = createNode();
        } finally {
            if (previousDbPath === undefined) {
                delete process.env.DB_PATH;
            } else {
                process.env.DB_PATH = previousDbPath;
            }
        }

        try {
            const a = await nodeA.start();
            const b = await nodeB.start({ peers: [a.url()] });
            await waitFor(() => connected(a, b), "anslutning");

            const shared = a.record();
            await waitFor(() => sameChain(a, b), "gemensam start");

            // Bryt anslutningen och låt båda mina ett block med samma index
            await b.p2p.stop();
            await waitFor(() => a.p2p.getPeerCount() === 0, "frånkoppling");

            const aEntry = a.record(2);
            const bEntry = b.record(3);

            expect(a.chain()).toHaveLength(3);
            expect(b.chain()).toHaveLength(3);
            expect(a.latestHash()).not.toBe(b.latestHash());

            // Återanslut
            b.p2p = b.createP2PServer({ port: 0, peers: [a.url()], ledger: b.service, log: () => {}, reconnectInterval: 100 });
            await b.p2p.start();

            await waitFor(() => sameChain(a, b) && a.chain().length === 4, "konvergens");

            // Alla tre poster finns på båda noderna
            const expected = [shared.entry.entryHash, aEntry.entry.entryHash, bEntry.entry.entryHash].sort();
            expect(a.entryHashes()).toEqual(expected);
            expect(b.entryHashes()).toEqual(expected);

            // Blocket med lägst hash behöll plats 2, den andra posten minades om sist
            const [winningHash] = [aEntry.block.hash, bEntry.block.hash].sort();
            const loser = winningHash === aEntry.block.hash ? bEntry : aEntry;
            expect(a.chain()[2].hash).toBe(winningHash);
            expect(a.chain()[3].data.entryHash).toBe(loser.entry.entryHash);

            expect(a.service.verifyAll()).toMatchObject({ valid: true, rowCount: 3, entryCount: 3 });
            expect(b.service.verifyAll()).toMatchObject({ valid: true, rowCount: 3, entryCount: 3 });
        } finally {
            [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].forEach(file => fs.rmSync(file, { force: true }));
        }
    });
});


describe("skydd mot felaktiga meddelanden", () => {

    // Lyssnaren sätts före open, eftersom nodens första meddelande kan
    // komma i samma tick som anslutningen öppnas
    async function rawClient(node) {
        const client = new WebSocket(node.url());
        client.messages = [];
        client.on("message", raw => client.messages.push(JSON.parse(raw.toString())));
        await new Promise((resolve, reject) => {
            client.once("open", resolve);
            client.once("error", reject);
        });
        return client;
    }

    test("ett block med fel hash läggs inte till och sprids inte", async () => {
        const a = await createNode().start();
        const b = await createNode().start({ peers: [a.url()] });
        await waitFor(() => connected(a, b), "anslutning");

        const genesis = a.chain()[0];
        const fake = {
            index: 1,
            timestamp: new Date().toISOString(),
            data: { id: 1, entryHash: "x" },
            previousHash: genesis.hash,
            nonce: 0,
            hash: "0".repeat(64)
        };

        const client = await rawClient(a);
        client.send(JSON.stringify({ type: MESSAGE_TYPES.BROADCAST_BLOCK, data: fake }));
        await pause(150);
        client.close();

        expect(a.chain()).toHaveLength(1);
        expect(b.chain()).toHaveLength(1);
    });

    test("skräp, okända typer och felaktig data kraschar inte noden", async () => {
        const a = await createNode().start();
        const client = await rawClient(a);

        client.send("inte json");
        client.send(JSON.stringify({ type: "NÅGOT_ANNAT" }));
        client.send(JSON.stringify({ type: MESSAGE_TYPES.RESPONSE_BLOCKCHAIN, data: "inte en lista" }));
        client.send(JSON.stringify({ type: MESSAGE_TYPES.RESPONSE_BLOCKCHAIN, data: [null, 5, { index: "x" }] }));
        client.send(JSON.stringify({ type: MESSAGE_TYPES.BROADCAST_BLOCK, data: null }));
        client.send(JSON.stringify(null));
        await pause(150);

        expect(a.chain()).toHaveLength(1);
        expect(client.readyState).toBe(WebSocket.OPEN);
        client.close();
    });

    test("svarar på QUERY_LATEST och QUERY_ALL", async () => {
        const a = await createNode().start();
        a.record();
        a.record();

        const client = await rawClient(a);
        const { messages } = client;

        client.send(JSON.stringify({ type: MESSAGE_TYPES.QUERY_LATEST }));
        client.send(JSON.stringify({ type: MESSAGE_TYPES.QUERY_ALL }));

        // Noden frågar själv efter vårt senaste direkt vid anslutning,
        // sedan kommer svaren på våra två frågor
        await waitFor(() => messages.length === 3, "tre meddelanden");
        client.close();

        expect(messages[0]).toEqual({ type: MESSAGE_TYPES.QUERY_LATEST });
        expect(messages[1]).toMatchObject({ type: MESSAGE_TYPES.RESPONSE_BLOCKCHAIN });
        expect(messages[1].data).toHaveLength(1);
        expect(messages[1].data[0].hash).toBe(a.latestHash());
        expect(messages[2].data).toHaveLength(3);
    });

    test("en fork besvaras med egen kedja bara när den mottagna kedjan är giltig", async () => {
        const a = await createNode().start();
        a.record();
        const ours = a.latestHash();

        // En lika lång kedja från en annan nod, genesis plus ett block,
        // vars sista hash uppfyller villkoret
        function equalChain(accept) {
            for (let id = 50; id < 5000; id++) {
                const other = new Blockchain();
                other.addBlock({
                    id, patientId: 2, userId: 2, role: "sjuksköterska", action: "READ",
                    noteId: null, timestamp: "2026-10-01T12:00:00.000Z", entryHash: String(id).repeat(64).slice(0, 64)
                });
                if (accept(other.getLatestBlock().hash)) {
                    return JSON.parse(JSON.stringify(other.chain));
                }
            }
            throw new Error("hittade ingen passande kedja");
        }

        const responses = (client) => client.messages.filter(message => message.type === MESSAGE_TYPES.RESPONSE_BLOCKCHAIN);

        // Lika lång kedja med manipulerad hash: ignoreras helt, inget svar
        const tampered = equalChain(() => true);
        tampered[1].hash = tampered[1].hash.slice(0, -1) + (tampered[1].hash.endsWith("0") ? "1" : "0");

        const client = await rawClient(a);
        client.send(JSON.stringify({ type: MESSAGE_TYPES.RESPONSE_BLOCKCHAIN, data: tampered }));
        await pause(150);

        expect(a.chain()).toHaveLength(2);
        expect(a.latestHash()).toBe(ours);
        expect(responses(client)).toHaveLength(0);

        // Lika lång giltig kedja med högre sista hash: A behåller sin kedja
        // och skickar den, exakt en gång, så att motparten byter
        const higher = equalChain(hash => hash > ours);
        client.send(JSON.stringify({ type: MESSAGE_TYPES.RESPONSE_BLOCKCHAIN, data: higher }));
        await pause(150);
        client.close();

        expect(a.latestHash()).toBe(ours);
        expect(responses(client)).toHaveLength(1);
        expect(responses(client)[0].data).toEqual(JSON.parse(JSON.stringify(a.chain())));
    });
});
