const request = require("supertest");


// Hjälpfunktioner för API-testerna.


// Laddar om alla moduler så att testet får en egen databas i minnet och
// en egen kedja, och lägger in demodata.
function freshApp() {
    jest.resetModules();
    require("../../src/database/seed")();
    return require("../../src/app");
}


// Loggar in via API:et och returnerar en agent som behåller cookien.
// Alla demokonton har lösenordet 1234.
async function loginAs(app, username) {

    const agent = request.agent(app);

    await agent
        .post("/api/login")
        .send({ username, password: "1234" })
        .expect(200);

    return agent;
}


// Samma modulinstanser som appen använder. Anropas efter freshApp.
function accessLogService() {
    return require("../../src/services/accessLogService");
}

function db() {
    return require("../../src/config/database");
}


module.exports = {
    freshApp,
    loginAs,
    accessLogService,
    db
};
