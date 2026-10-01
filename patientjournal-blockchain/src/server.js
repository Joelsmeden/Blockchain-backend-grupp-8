const http = require("http");

const seed = require("./database/seed");
const app = require("./app");
const accessLogService = require("./services/accessLogService");
const { createP2PServer } = require("./p2p/p2pServer");
const { createSocketHandler } = require("./p2p/socketHandler");


// Samma fil startas en gång per nod med olika miljövariabler:
//
//   npm run node1    PORT=3001 P2P_PORT=6001
//   npm run node2    PORT=3002 P2P_PORT=6002 PEERS=ws://localhost:6001
//
// Båda noderna delar databasfilen men har varsin kedja i minnet, sparad
// i data/chain-<P2P_PORT>.json.

const PORT = Number(process.env.PORT) || 3000;
const P2P_PORT = Number(process.env.P2P_PORT) || 6000;
const PEERS = (process.env.PEERS || "")
    .split(",")
    .map(peer => peer.trim())
    .filter(Boolean);
const NODE_NAME = process.env.NODE_NAME || `nod-${PORT}`;


// Ordningen spelar roll: seeden tar bort gamla kedjefiler om databasen
// var tom, och först därefter läses en eventuell sparad kedja in.
if (seed()) {
    console.log(`${NODE_NAME}: databasen var tom, demodata inlagd.`);
}

if (accessLogService.loadChain()) {
    console.log(`${NODE_NAME}: sparad kedja inläst, ${accessLogService.getChain().length} block.`);
}


app.locals.nodeInfo = {
    name: NODE_NAME,
    port: PORT,
    p2pPort: P2P_PORT,
    peers: PEERS
};


const server = http.createServer(app);


// Realtid till webbläsarna över samma HTTP-server, med samma session
createSocketHandler({
    httpServer: server,
    sessionMiddleware: app.locals.sessionMiddleware,
    log: text => console.log(`${NODE_NAME}: ${text}`)
});


// P2P mellan noderna. /api/status läser antalet peers härifrån.
const p2p = createP2PServer({ port: P2P_PORT, peers: PEERS, name: NODE_NAME });
app.locals.p2p = p2p;


server.listen(PORT, () => {
    console.log(`${NODE_NAME}: HTTP på http://localhost:${PORT}`);
});

p2p.start().catch(error => {
    console.error(`${NODE_NAME}: kunde inte starta P2P på port ${P2P_PORT}: ${error.message}`);
    process.exit(1);
});
