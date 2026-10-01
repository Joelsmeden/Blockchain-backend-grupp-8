const { freshApp, loginAs, accessLogService } = require("../helpers/api");


let app;

beforeEach(() => {
    app = freshApp();
});

const note = {
    title: "Uppföljning",
    content: "Patienten mår bättre efter medicinjusteringen."
};


describe("POST /api/patients/:id/notes", () => {

    test("läkare skriver en anteckning och skrivningen loggas med anteckningens id", async () => {
        const agent = await loginAs(app, "doctor");
        const response = await agent
            .post("/api/patients/1/notes")
            .send({ ...note, visibility: "all" })
            .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe("Anteckningen sparades.");
        expect(response.body.note).toMatchObject({
            patientId: 1,
            authorId: 1,
            authorName: "Anna Andersson",
            authorRole: "läkare",
            title: "Uppföljning",
            content: "Patienten mår bättre efter medicinjusteringen.",
            visibility: "all"
        });
        expect(response.body.note.id).toEqual(expect.any(Number));
        expect(response.body.note.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);

        const log = accessLogService().getLogForPatient(1);
        expect(log).toHaveLength(1);
        expect(log[0]).toMatchObject({
            userId: 1,
            action: "WRITE",
            noteId: response.body.note.id
        });

        const latest = accessLogService().getBlockchain().getLatestBlock();
        expect(latest.data).toMatchObject({ action: "WRITE", noteId: response.body.note.id, patientId: 1 });
    });

    test("sjuksköterska får skriva", async () => {
        const agent = await loginAs(app, "nurse");
        const response = await agent.post("/api/patients/2/notes").send(note).expect(201);

        expect(response.body.note).toMatchObject({ authorId: 2, authorRole: "sjuksköterska" });
    });

    test("synligheten är staff om inget anges", async () => {
        const agent = await loginAs(app, "doctor");
        const response = await agent.post("/api/patients/1/notes").send(note).expect(201);

        expect(response.body.note.visibility).toBe("staff");
    });

    test("trimmar rubrik och innehåll", async () => {
        const agent = await loginAs(app, "doctor");
        const response = await agent
            .post("/api/patients/1/notes")
            .send({ title: "  Rubrik  ", content: "\n Text \n" })
            .expect(201);

        expect(response.body.note).toMatchObject({ title: "Rubrik", content: "Text" });
    });

    test("den nya anteckningen syns i journalen", async () => {
        const agent = await loginAs(app, "doctor");
        const created = await agent.post("/api/patients/3/notes").send(note).expect(201);
        const journal = await agent.get("/api/patients/3").expect(200);

        expect(journal.body.notes[0].id).toBe(created.body.note.id);
    });

    test("en privat anteckning syns bara för författaren", async () => {
        const doctor = await loginAs(app, "doctor");
        const created = await doctor
            .post("/api/patients/3/notes")
            .send({ ...note, visibility: "private" })
            .expect(201);

        const asDoctor = await doctor.get("/api/patients/3").expect(200);
        expect(asDoctor.body.notes.map(n => n.id)).toContain(created.body.note.id);

        const nurse = await loginAs(app, "nurse");
        const asNurse = await nurse.get("/api/patients/3").expect(200);
        expect(asNurse.body.notes.map(n => n.id)).not.toContain(created.body.note.id);
    });

    test("en anteckning med synlighet all syns för patienten, en med staff gör det inte", async () => {
        const doctor = await loginAs(app, "doctor");
        const forAll = await doctor.post("/api/patients/1/notes").send({ ...note, visibility: "all" }).expect(201);
        const forStaff = await doctor.post("/api/patients/1/notes").send({ ...note, visibility: "staff" }).expect(201);

        const patient = await loginAs(app, "patient");
        const journal = await patient.get("/api/patients/1").expect(200);
        const ids = journal.body.notes.map(n => n.id);

        expect(ids).toContain(forAll.body.note.id);
        expect(ids).not.toContain(forStaff.body.note.id);
    });

    test.each([
        ["rubrik saknas", { content: "text" }, "Rubrik krävs."],
        ["rubrik är tom", { title: "   ", content: "text" }, "Rubrik krävs."],
        ["innehåll saknas", { title: "Rubrik" }, "Innehåll krävs."],
        ["innehåll är tomt", { title: "Rubrik", content: "" }, "Innehåll krävs."],
        ["synligheten är okänd", { title: "Rubrik", content: "text", visibility: "public" }, "Synlighet måste vara private, staff eller all."],
        ["rubriken är för lång", { title: "x".repeat(201), content: "text" }, "Rubriken får vara högst 200 tecken."]
    ])("ger 400 när %s och loggar inget", async (label, body, message) => {
        const agent = await loginAs(app, "doctor");
        const response = await agent.post("/api/patients/1/notes").send(body).expect(400);

        expect(response.body).toEqual({ success: false, message });
        expect(accessLogService().getChain()).toHaveLength(1);
    });

    test("ger 400 utan body", async () => {
        const agent = await loginAs(app, "doctor");
        const response = await agent.post("/api/patients/1/notes").expect(400);

        expect(response.body).toEqual({ success: false, message: "Rubrik krävs." });
    });

    test.each([
        ["patient", 4, "patient"],
        ["clinic", 3, "vårdcentral"],
        ["unauthorized", 5, "obehörig"]
    ])("%s får 403 och försöket loggas som DENIED mot patienten", async (username, userId, role) => {
        const agent = await loginAs(app, username);
        const response = await agent.post("/api/patients/1/notes").send(note).expect(403);

        expect(response.body).toEqual({ success: false, message: "Åtkomst nekad." });

        const log = accessLogService().getLogForPatient(1);
        expect(log).toHaveLength(1);
        expect(log[0]).toMatchObject({ patientId: 1, userId, role, action: "DENIED", noteId: null });
    });

    test("ger 404 för en patient som inte finns, utan loggning", async () => {
        const agent = await loginAs(app, "doctor");
        const response = await agent.post("/api/patients/999/notes").send(note).expect(404);

        expect(response.body).toEqual({ success: false, message: "Patienten finns inte." });
        expect(accessLogService().getChain()).toHaveLength(1);
    });
});
