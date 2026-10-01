const { freshApp, loginAs, accessLogService } = require("../helpers/api");


// Varje test får en egen app med egen databas och kedja. Ett test som
// loggar in mer än en gång binder appen till en konstant först, så att en
// fortsättning efter en timeout aldrig anropar nästa tests app.
let app;

beforeEach(() => {
    app = freshApp();
});


describe("GET /api/patients", () => {

    test("läkare får alla patienter utan söksträng", async () => {
        const agent = await loginAs(app, "doctor");
        const response = await agent.get("/api/patients").expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.patients).toHaveLength(3);
        expect(response.body.patients[0]).toEqual({
            id: 1,
            personalNumber: "19850412-2384",
            firstName: "Lisa",
            lastName: "Karlsson",
            dateOfBirth: "1985-04-12"
        });
    });

    test("söker på namn och personnummer", async () => {
        const agent = await loginAs(app, "doctor");

        const byName = await agent.get("/api/patients?q=lisa").expect(200);
        expect(byName.body.patients.map(p => p.firstName)).toEqual(["Lisa"]);

        const byFullName = await agent.get("/api/patients?q=Johan Nilsson").expect(200);
        expect(byFullName.body.patients.map(p => p.id)).toEqual([2]);

        const byNumber = await agent.get("/api/patients?q=20010217").expect(200);
        expect(byNumber.body.patients.map(p => p.lastName)).toEqual(["Lindqvist"]);

        const none = await agent.get("/api/patients?q=finnsinte").expect(200);
        expect(none.body.patients).toEqual([]);
    });

    test.each(["nurse", "clinic"])("%s får söka", async (username) => {
        const agent = await loginAs(app, username);
        const response = await agent.get("/api/patients").expect(200);

        expect(response.body.patients).toHaveLength(3);
    });

    test.each(["patient", "unauthorized"])("%s får 403", async (username) => {
        const agent = await loginAs(app, username);
        const response = await agent.get("/api/patients").expect(403);

        expect(response.body).toEqual({ success: false, message: "Åtkomst nekad." });
    });

    test("sökning loggas inte i liggaren", async () => {
        const agent = await loginAs(app, "doctor");
        await agent.get("/api/patients?q=lisa").expect(200);

        expect(accessLogService().getChain()).toHaveLength(1);
    });
});


describe("GET /api/patients/:id", () => {

    test("läkare öppnar en journal och läsningen loggas", async () => {
        const agent = await loginAs(app, "doctor");
        const response = await agent.get("/api/patients/2").expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.patient).toMatchObject({ id: 2, firstName: "Johan", lastName: "Nilsson" });
        expect(Array.isArray(response.body.notes)).toBe(true);

        // Den egna läsningen syns överst i loggen
        expect(response.body.accessLog).toHaveLength(1);
        expect(response.body.accessLog[0]).toMatchObject({
            patientId: 2,
            userId: 1,
            userName: "Anna Andersson",
            role: "läkare",
            action: "READ",
            noteId: null
        });
        expect(response.body.accessLog[0].entryHash).toMatch(/^[0-9a-f]{64}$/);
        expect(response.body.accessLog[0].blockHash).toMatch(/^[0-9a-f]{64}$/);

        const chain = accessLogService().getChain();
        expect(chain).toHaveLength(2);
        expect(chain[1].data).toMatchObject({ patientId: 2, userId: 1, action: "READ" });
        expect(chain[1].hash).toBe(response.body.accessLog[0].blockHash);
    });

    test.each([
        ["doctor", ["private", "staff", "all"]],
        ["nurse", ["staff", "all"]],
        ["clinic", ["all"]],
        ["patient", ["all"]]
    ])("%s ser anteckningarna %j för patient 1", async (username, visibilities) => {
        const agent = await loginAs(app, username);
        const response = await agent.get("/api/patients/1").expect(200);

        expect(response.body.notes.map(note => note.visibility).sort()).toEqual([...visibilities].sort());
    });

    test("anteckningar innehåller författarens namn men inga lösenordsfält", async () => {
        const agent = await loginAs(app, "doctor");
        const response = await agent.get("/api/patients/1").expect(200);

        expect(response.body.notes[0]).toMatchObject({
            patientId: 1,
            authorName: expect.any(String),
            title: expect.any(String),
            content: expect.any(String)
        });
        expect(JSON.stringify(response.body)).not.toMatch(/password/i);
    });

    test("patienten får öppna sin egen journal", async () => {
        const agent = await loginAs(app, "patient");
        const response = await agent.get("/api/patients/1").expect(200);

        expect(response.body.patient.id).toBe(1);
        expect(response.body.accessLog[0]).toMatchObject({ userId: 4, role: "patient", action: "READ" });
    });

    test("patienten får 403 på någon annans journal och försöket loggas mot den andra patienten", async () => {
        const agent = await loginAs(app, "patient");
        const response = await agent.get("/api/patients/2").expect(403);

        expect(response.body).toEqual({ success: false, message: "Åtkomst nekad." });
        expect(response.body.patient).toBeUndefined();
        expect(response.body.notes).toBeUndefined();

        const log = accessLogService().getLogForPatient(2);
        expect(log).toHaveLength(1);
        expect(log[0]).toMatchObject({
            patientId: 2,
            userId: 4,
            userName: "Lisa Karlsson",
            role: "patient",
            action: "DENIED"
        });
        expect(accessLogService().getLogForPatient(1)).toHaveLength(0);

        const latest = accessLogService().getBlockchain().getLatestBlock();
        expect(latest.data).toMatchObject({ patientId: 2, userId: 4, action: "DENIED" });
    });

    test("den nekade åtkomsten syns i den andra patientens logg", async () => {
        const currentApp = app;
        const patientAgent = await loginAs(currentApp, "patient");
        await patientAgent.get("/api/patients/2").expect(403);

        const doctorAgent = await loginAs(currentApp, "doctor");
        const response = await doctorAgent.get("/api/patients/2").expect(200);

        expect(response.body.accessLog.map(entry => [entry.action, entry.userName])).toEqual([
            ["READ", "Anna Andersson"],
            ["DENIED", "Lisa Karlsson"]
        ]);
    });

    test("obehörig får 403 och försöket loggas", async () => {
        const agent = await loginAs(app, "unauthorized");
        await agent.get("/api/patients/1").expect(403);

        expect(accessLogService().getLogForPatient(1)[0]).toMatchObject({
            userId: 5,
            role: "obehörig",
            action: "DENIED"
        });
    });

    test.each(["999", "abc", "0", "-1", "1.5"])("okänd eller ogiltig patient %s ger 404 utan loggning", async (id) => {
        const agent = await loginAs(app, "doctor");
        const response = await agent.get(`/api/patients/${id}`).expect(404);

        expect(response.body).toEqual({ success: false, message: "Patienten finns inte." });
        expect(accessLogService().getChain()).toHaveLength(1);
    });

    test("obehörig får 404, inte 403, för en patient som inte finns", async () => {
        const agent = await loginAs(app, "unauthorized");
        await agent.get("/api/patients/999").expect(404);

        expect(accessLogService().getChain()).toHaveLength(1);
    });
});
