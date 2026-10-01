const { freshApp, loginAs, api } = require("../helpers/api");


let app;

beforeEach(() => {
    app = freshApp();
});


describe("POST /api/login", () => {

    test("loggar in med rätt uppgifter och sätter en sessionscookie", async () => {
        const response = await api(app)
            .post("/api/login")
            .send({ username: "doctor", password: "1234" })
            .expect(200);

        expect(response.body).toEqual({
            success: true,
            message: "Inloggning lyckades.",
            user: {
                id: 1,
                username: "doctor",
                name: "Anna Andersson",
                role: "läkare",
                patientId: null
            }
        });
        expect(response.headers["set-cookie"][0]).toMatch(/^patientjournal\.sid=/);
        expect(response.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    });

    test("patientkontot får sitt patientId i sessionen", async () => {
        const response = await api(app)
            .post("/api/login")
            .send({ username: "patient", password: "1234" })
            .expect(200);

        expect(response.body.user).toMatchObject({ role: "patient", patientId: 1 });
    });

    test("patient2 finns bara i databasen och får patientId 2 i sessionen", async () => {
        const userModel = require("../../src/models/userModel");
        expect(userModel.users.some(user => user.username === "patient2")).toBe(false);

        const agent = await loginAs(app, "patient2");
        const response = await agent.get("/api/me").expect(200);

        expect(response.body.user).toEqual({
            id: 6,
            username: "patient2",
            name: "Johan Nilsson",
            role: "patient",
            patientId: 2
        });
    });

    test("ger 401 vid fel lösenord", async () => {
        const response = await api(app)
            .post("/api/login")
            .send({ username: "doctor", password: "fel" })
            .expect(401);

        expect(response.body).toEqual({
            success: false,
            message: "Felaktigt användarnamn eller lösenord."
        });
        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    test("ger 401 för okänd användare", async () => {
        await api(app)
            .post("/api/login")
            .send({ username: "finnsinte", password: "1234" })
            .expect(401);
    });

    test("ger 400 när fält saknas", async () => {
        const response = await api(app)
            .post("/api/login")
            .send({ username: "doctor" })
            .expect(400);

        expect(response.body).toEqual({
            success: false,
            message: "Användarnamn och lösenord krävs."
        });
    });

    test("ger 400 vid ogiltig JSON", async () => {
        const response = await api(app)
            .post("/api/login")
            .set("Content-Type", "application/json")
            .send('{"username": ')
            .expect(400);

        expect(response.body).toEqual({
            success: false,
            message: "Ogiltig JSON i anropet."
        });
    });
});


describe("GET /api/me", () => {

    test("ger 401 utan inloggning", async () => {
        const response = await api(app).get("/api/me").expect(401);

        expect(response.body).toEqual({
            success: false,
            message: "Ingen användare är inloggad."
        });
    });

    test("ger den inloggade användaren", async () => {
        const agent = await loginAs(app, "nurse");
        const response = await agent.get("/api/me").expect(200);

        expect(response.body).toEqual({
            success: true,
            user: {
                id: 2,
                username: "nurse",
                name: "Erik Svensson",
                role: "sjuksköterska",
                patientId: null
            }
        });
    });
});


describe("POST /api/logout", () => {

    test("avslutar sessionen", async () => {
        const agent = await loginAs(app, "doctor");

        const response = await agent.post("/api/logout").expect(200);
        expect(response.body).toEqual({ success: true, message: "Du är nu utloggad." });

        await agent.get("/api/me").expect(401);
    });
});


describe("skyddade routes utan inloggning", () => {

    test.each([
        ["GET", "/api/patients"],
        ["GET", "/api/patients/1"],
        ["POST", "/api/patients/1/notes"]
    ])("%s %s ger 401", async (method, url) => {
        const response = await api(app)[method.toLowerCase()](url).expect(401);

        expect(response.body).toEqual({
            success: false,
            message: "Du måste vara inloggad."
        });
    });
});


describe("okänd API-väg", () => {

    test("ger 404 som JSON", async () => {
        const response = await api(app).get("/api/finns-inte").expect(404);

        expect(response.body).toEqual({ success: false, message: "Hittades inte." });
    });
});
