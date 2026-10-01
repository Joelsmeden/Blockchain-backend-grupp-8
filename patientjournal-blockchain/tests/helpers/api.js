const http = require("http");
const request = require("supertest");


// Hjälpfunktioner för API-testerna.


// Laddar om alla moduler så att testet får en egen databas i minnet och
// en egen kedja, och lägger in demodata. Returnerar Express-appen.
function freshApp() {
    jest.resetModules();
    require("../../src/database/seed")();
    return require("../../src/app");
}


// En lyssnande server per app. Får supertest en app i stället för en
// server startar och stänger den en egen server för varje anrop, vilket
// på Node 22 ibland gav felaktiga svar mitt i sviten. Servrarna stängs
// efter varje test.
const servers = new WeakMap();
const openServers = [];

function serverFor(app) {

    let server = servers.get(app);

    if (!server) {
        server = http.createServer(app).listen(0);
        servers.set(app, server);
        openServers.push(server);
    }

    return server;
}

afterEach(() => Promise.all(
    openServers.splice(0).map(server => new Promise(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
    }))
));


// Ett anrop mot appen utan cookie
function api(app) {
    return request(serverFor(app));
}


// Loggar in via API:et och returnerar en agent som behåller cookien.
// Alla demokonton har lösenordet 1234.
async function loginAs(app, username) {

    const agent = request.agent(serverFor(app));

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
    serverFor,
    api,
    loginAs,
    accessLogService,
    db
};
