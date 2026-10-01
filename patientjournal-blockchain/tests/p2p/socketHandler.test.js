const http = require("http");
const request = require("supertest");
const { io: ioClient } = require("socket.io-client");
const { freshApp, accessLogService } = require("../helpers/api");


// Riktig socket.io-server på en ledig port, med appens session så att
// inloggningen via API:et gäller även för realtidsanslutningen.

let app;
let service;
let server;
let handler;
let url;
let clients = [];
let EVENTS;

const doctor = { id: 1, role: "läkare" };
const nurse = { id: 2, role: "sjuksköterska" };
const patient = { id: 4, role: "patient", patientId: 1 };

beforeEach(async () => {
    app = freshApp();
    service = accessLogService();

    const socketHandler = require("../../src/p2p/socketHandler");
    EVENTS = socketHandler.EVENTS;

    server = http.createServer(app);
    handler = socketHandler.createSocketHandler({
        httpServer: server,
        sessionMiddleware: app.locals.sessionMiddleware,
        log: () => {}
    });

    await new Promise(resolve => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
});

afterEach(async () => {
    clients.forEach(client => client.close());
    clients = [];
    await handler.close();
    await new Promise(resolve => server.close(resolve));
});


async function cookieFor(username) {
    const response = await request(server)
        .post("/api/login")
        .send({ username, password: "1234" })
        .expect(200);

    return response.headers["set-cookie"][0].split(";")[0];
}

function connect(cookie) {
    const client = ioClient(url, {
        extraHeaders: cookie ? { Cookie: cookie } : {},
        transports: ["websocket"],
        reconnection: false,
        forceNew: true
    });
    clients.push(client);
    return client;
}

async function connectAs(username) {
    const client = connect(await cookieFor(username));
    await once(client, "connect");
    return client;
}

const once = (emitter, event) => new Promise(resolve => emitter.once(event, resolve));
const join = (client, patientId) => new Promise(resolve => client.emit(EVENTS.JOIN, patientId, resolve));
const leave = (client, patientId) => new Promise(resolve => client.emit(EVENTS.LEAVE, patientId, resolve));

// Löses efter en kort stund om händelsen inte kom, annars fel
function silence(client, event, ms = 200) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { client.off(event, onEvent); resolve(); }, ms);
        const onEvent = () => { clearTimeout(timer); reject(new Error(`Fick ${event} fast inget skulle komma`)); };
        client.once(event, onEvent);
    });
}


describe("handshake", () => {

    test("nekar anslutning utan session", async () => {
        const client = connect(null);
        const error = await once(client, "connect_error");

        expect(error.message).toBe("Du måste vara inloggad.");
        expect(client.connected).toBe(false);
    });

    test("nekar anslutning med en cookie som inte hör till någon session", async () => {
        const client = connect("patientjournal.sid=s%3Afinnsinte.abc");
        const error = await once(client, "connect_error");

        expect(error.message).toBe("Du måste vara inloggad.");
    });

    test("släpper in en inloggad användare", async () => {
        const client = await connectAs("doctor");

        expect(client.connected).toBe(true);
    });

    test("en utloggad session släpps inte in", async () => {
        const cookie = await cookieFor("doctor");
        await request(server).post("/api/logout").set("Cookie", cookie).expect(200);

        const client = connect(cookie);
        const error = await once(client, "connect_error");

        expect(error.message).toBe("Du måste vara inloggad.");
    });
});


describe("patient:join", () => {

    test.each(["doctor", "nurse", "clinic"])("%s får gå med i vilken patients rum som helst", async (username) => {
        const client = await connectAs(username);

        expect(await join(client, 1)).toEqual({ success: true, message: "Lyssnar på patient 1.", patientId: 1 });
        expect(await join(client, 2)).toMatchObject({ success: true, patientId: 2 });
    });

    test("patienten får gå med i sitt eget rum men inte någon annans", async () => {
        const client = await connectAs("patient");

        expect(await join(client, 2)).toEqual({ success: false, message: "Åtkomst nekad." });
        expect(await join(client, "2")).toEqual({ success: false, message: "Åtkomst nekad." });
        expect(await join(client, 1)).toMatchObject({ success: true, patientId: 1 });
        expect(await join(client, "1")).toMatchObject({ success: true, patientId: 1 });
    });

    test("obehörig nekas alla rum", async () => {
        const client = await connectAs("unauthorized");

        expect(await join(client, 1)).toEqual({ success: false, message: "Åtkomst nekad." });
    });

    test("ogiltigt id nekas", async () => {
        const client = await connectAs("doctor");

        expect(await join(client, "abc")).toEqual({ success: false, message: "Åtkomst nekad." });
        expect(await join(client, null)).toEqual({ success: false, message: "Åtkomst nekad." });
        expect(await join(client, 1.5)).toEqual({ success: false, message: "Åtkomst nekad." });
    });
});


describe("händelser", () => {

    test("READ ger access:logged med posten, med namn från databasen", async () => {
        const client = await connectAs("doctor");
        await join(client, 1);

        const received = once(client, EVENTS.ACCESS_LOGGED);
        const { entry } = service.recordAccess({ user: nurse, patientId: 1, action: "READ" });

        expect(await received).toEqual(entry);
        expect(entry).toMatchObject({ patientId: 1, userId: 2, userName: "Erik Svensson", action: "READ" });
    });

    test("DENIED ger access:logged", async () => {
        const client = await connectAs("doctor");
        await join(client, 2);

        const received = once(client, EVENTS.ACCESS_LOGGED);
        service.recordAccess({ user: patient, patientId: 2, action: "DENIED" });

        expect(await received).toMatchObject({ patientId: 2, userId: 4, userName: "Lisa Karlsson", action: "DENIED" });
    });

    test("WRITE ger journal:updated och inte access:logged", async () => {
        const client = await connectAs("doctor");
        await join(client, 1);

        const updated = once(client, EVENTS.JOURNAL_UPDATED);
        const noAccessLogged = silence(client, EVENTS.ACCESS_LOGGED);
        const { entry } = service.recordAccess({ user: doctor, patientId: 1, action: "WRITE", noteId: 1 });

        expect(await updated).toEqual({ patientId: 1, noteId: 1, entry });
        await noAccessLogged;
    });

    test("en händelse för en annan patient når inte rummet", async () => {
        const client = await connectAs("doctor");
        await join(client, 1);

        const nothing = silence(client, EVENTS.ACCESS_LOGGED);
        service.recordAccess({ user: nurse, patientId: 2, action: "READ" });

        await nothing;
    });

    test("ett block som kommit från en annan nod når också rummet", async () => {
        const client = await connectAs("doctor");
        await join(client, 1);

        const Blockchain = require("../../src/blockchain/Blockchain");
        const other = new Blockchain();
        const block = JSON.parse(JSON.stringify(other.addBlock({
            id: 77, patientId: 1, userId: 2, role: "sjuksköterska", action: "READ",
            noteId: null, timestamp: "2026-10-01T12:00:00.000Z", entryHash: "a".repeat(64)
        })));

        const received = once(client, EVENTS.ACCESS_LOGGED);
        expect(service.receiveBlock(block)).toBe(true);

        // Raden finns inte i den här nodens databas, så posten byggs
        // från blocket utan namn
        expect(await received).toEqual({
            id: 77, patientId: 1, userId: 2, role: "sjuksköterska", action: "READ",
            noteId: null, timestamp: "2026-10-01T12:00:00.000Z",
            userName: null, entryHash: "a".repeat(64), blockHash: block.hash
        });
    });

    test("klienten lyssnar på en patient i taget", async () => {
        const client = await connectAs("doctor");
        await join(client, 1);
        await join(client, 2);

        const nothing = silence(client, EVENTS.ACCESS_LOGGED);
        service.recordAccess({ user: nurse, patientId: 1, action: "READ" });
        await nothing;

        const received = once(client, EVENTS.ACCESS_LOGGED);
        service.recordAccess({ user: nurse, patientId: 2, action: "READ" });
        expect(await received).toMatchObject({ patientId: 2 });
    });

    test("patient:leave slutar lyssna", async () => {
        const client = await connectAs("doctor");
        await join(client, 1);
        expect(await leave(client, 1)).toEqual({ success: true, message: "Slutade lyssna." });

        const nothing = silence(client, EVENTS.ACCESS_LOGGED);
        service.recordAccess({ user: nurse, patientId: 1, action: "READ" });
        await nothing;
    });

    test("alla i rummet får händelsen, de utanför får den inte", async () => {
        const first = await connectAs("doctor");
        const second = await connectAs("clinic");
        const outside = await connectAs("nurse");
        await join(first, 1);
        await join(second, 1);
        await join(outside, 3);

        const received = Promise.all([once(first, EVENTS.ACCESS_LOGGED), once(second, EVENTS.ACCESS_LOGGED)]);
        const nothing = silence(outside, EVENTS.ACCESS_LOGGED);
        service.recordAccess({ user: nurse, patientId: 1, action: "READ" });

        const [a, b] = await received;
        expect(a).toEqual(b);
        expect(a).toMatchObject({ patientId: 1, action: "READ" });
        await nothing;
    });

    test("patienten ser i realtid när någon annan försöker nå hens journal", async () => {
        const client = await connectAs("patient");
        await join(client, 1);

        const received = once(client, EVENTS.ACCESS_LOGGED);
        service.recordAccess({ user: { id: 6, role: "patient", patientId: 2 }, patientId: 1, action: "DENIED" });

        expect(await received).toMatchObject({ patientId: 1, userId: 6, action: "DENIED", userName: "Johan Nilsson" });
    });
});
