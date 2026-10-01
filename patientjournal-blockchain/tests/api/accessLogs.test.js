const request = require("supertest");
const { freshApp, loginAs, accessLogService, db } = require("../helpers/api");


let app;

beforeEach(() => {
    app = freshApp();
});


// Skapar lite trafik: en läsning, en skrivning och en nekad åtkomst
async function someTraffic() {
    const doctor = await loginAs(app, "doctor");
    await doctor.get("/api/patients/1").expect(200);
    await doctor.post("/api/patients/1/notes").send({ title: "Rubrik", content: "Text" }).expect(201);

    const patient = await loginAs(app, "patient");
    await patient.get("/api/patients/2").expect(403);
}


describe("GET /api/chain", () => {

    test("kan läsas utan inloggning och börjar med genesis", async () => {
        const response = await request(app).get("/api/chain").expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.length).toBe(1);
        expect(response.body.chain).toHaveLength(1);
        expect(response.body.chain[0]).toMatchObject({
            index: 0,
            previousHash: "0".repeat(64)
        });
    });

    test("innehåller ett block per åtkomst med bara id-nummer och hash", async () => {
        await someTraffic();

        const response = await request(app).get("/api/chain").expect(200);
        const [, read, write, denied] = response.body.chain;

        expect(response.body.length).toBe(4);
        expect(read.data).toMatchObject({ action: "READ", patientId: 1, userId: 1, role: "läkare" });
        expect(write.data).toMatchObject({ action: "WRITE", patientId: 1, userId: 1 });
        expect(write.data.noteId).toEqual(expect.any(Number));
        expect(denied.data).toMatchObject({ action: "DENIED", patientId: 2, userId: 4, role: "patient" });

        response.body.chain.slice(1).forEach(block => {
            expect(Object.keys(block.data).sort()).toEqual(
                ["action", "entryHash", "id", "noteId", "patientId", "role", "timestamp", "userId"]
            );
            expect(block.previousHash).toBe(response.body.chain[block.index - 1].hash);
        });
    });

    test("innehåller varken journaltext, namn eller personnummer", async () => {
        await someTraffic();

        const response = await request(app).get("/api/chain").expect(200);
        const serialized = JSON.stringify(response.body);

        ["Rubrik", "Text", "Blodtryck", "Årskontroll", "Anna", "Andersson", "Lisa", "Karlsson", "19850412"]
            .forEach(word => expect(serialized).not.toContain(word));
    });
});


describe("GET /api/chain/verify", () => {

    test("godkänner en orörd liggare", async () => {
        await someTraffic();

        const response = await request(app).get("/api/chain/verify").expect(200);

        expect(response.body).toEqual({
            success: true,
            message: "Liggaren stämmer med kedjan.",
            valid: true,
            chainValid: true,
            rowCount: 3,
            entryCount: 3,
            tamperedRows: [],
            missingRows: []
        });
    });

    test("pekar ut en ändrad rad", async () => {
        await someTraffic();
        const deniedRow = accessLogService().getLogForPatient(2)[0];

        db().prepare("UPDATE access_logs SET action = 'READ' WHERE id = ?").run(deniedRow.id);

        const response = await request(app).get("/api/chain/verify").expect(200);

        expect(response.body).toMatchObject({
            valid: false,
            message: "Liggaren stämmer inte med kedjan.",
            tamperedRows: [deniedRow.id],
            missingRows: []
        });
    });

    test("upptäcker en raderad rad", async () => {
        await someTraffic();
        const deniedRow = accessLogService().getLogForPatient(2)[0];

        db().prepare("DELETE FROM access_logs WHERE id = ?").run(deniedRow.id);

        const response = await request(app).get("/api/chain/verify").expect(200);

        expect(response.body).toMatchObject({
            valid: false,
            rowCount: 2,
            entryCount: 3,
            tamperedRows: [],
            missingRows: [deniedRow.id]
        });
    });
});


describe("GET /api/status", () => {

    test("svarar som ensam nod när server.js inte satt nodinfo", async () => {
        const response = await request(app).get("/api/status").expect(200);

        expect(response.body).toEqual({
            success: true,
            node: "nod",
            port: null,
            p2pPort: null,
            peers: 0,
            chainLength: 1,
            latestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
            difficulty: 1
        });
    });

    test("använder nodinfo och peers när de finns", async () => {
        app.locals.nodeInfo = { name: "nod-3001", port: 3001, p2pPort: 6001 };
        app.locals.p2p = { getPeerCount: () => 2 };

        const response = await request(app).get("/api/status").expect(200);

        expect(response.body).toMatchObject({ node: "nod-3001", port: 3001, p2pPort: 6001, peers: 2 });
    });

    test("kedjelängden följer liggaren", async () => {
        await someTraffic();

        const response = await request(app).get("/api/status").expect(200);

        expect(response.body.chainLength).toBe(4);
        expect(response.body.latestHash).toBe(accessLogService().getBlockchain().getLatestBlock().hash);
    });
});
