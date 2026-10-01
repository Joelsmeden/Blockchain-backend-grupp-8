const WebSocket = require("ws");
const accessLogService = require("../services/accessLogService");


// Varje nod är både server och klient: den lyssnar på P2P_PORT och
// ansluter själv till adresserna i PEERS. Över anslutningarna skickas
// block och hela kedjor som JSON. Vad som händer med ett mottaget block
// avgörs av liggaren, som äger kedjan.
//
// Protokoll:
//   QUERY_LATEST         be motparten om dess senaste block
//   QUERY_ALL            be motparten om hela kedjan
//   RESPONSE_BLOCKCHAIN  svar med ett eller flera block
//   BROADCAST_BLOCK      ett nytt block som just lagts till
//
// Mottagna block: ett block som pekar på vårt senaste läggs till och
// skickas vidare. Ett som inte passar leder till att hela kedjan begärs.
// En hel kedja ersätter vår om den är längre, eller lika lång med lägre
// sista hash. Den regeln avgör en fork där två noder minat var sitt
// block med samma index: exakt en nod byter, minar om sin post och
// sprider den som ett vanligt block. Den som behåller sin kedja skickar
// den till motparten så att båda tillämpar samma regel.

const MESSAGE_TYPES = Object.freeze({
    QUERY_LATEST: "QUERY_LATEST",
    QUERY_ALL: "QUERY_ALL",
    RESPONSE_BLOCKCHAIN: "RESPONSE_BLOCKCHAIN",
    BROADCAST_BLOCK: "BROADCAST_BLOCK"
});

const RECONNECT_INTERVAL = 3000;


function createP2PServer({
    port,
    peers = [],
    ledger = accessLogService,
    name = `p2p-${port}`,
    reconnectInterval = RECONNECT_INTERVAL,
    log = console.log
} = {}) {

    const sockets = new Set();          // öppna anslutningar, inkommande och utgående
    const reconnectTimers = new Map();  // peer-adress → timer
    let server = null;
    let stopped = false;

    const say = (text) => log(`${name}: P2P ${text}`);


    function send(socket, type, data) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type, data }));
        }
    }


    function broadcast(type, data, except = null) {
        sockets.forEach(socket => {
            if (socket !== except) {
                send(socket, type, data);
            }
        });
    }


    // Block från en annan nod, ett eller flera. Samma logik oavsett om de
    // kom som BROADCAST_BLOCK eller som svar på en fråga.
    function handleBlocks(blocks, from) {

        if (!Array.isArray(blocks)) {
            return;
        }

        const received = blocks
            .filter(block => block && typeof block === "object" && Number.isInteger(block.index))
            .sort((a, b) => a.index - b.index);

        if (received.length === 0) {
            return;
        }

        const latestReceived = received[received.length - 1];
        const latestOurs = ledger.getBlockchain().getLatestBlock();

        // Äldre än vårt senaste: inget vi saknar
        if (latestReceived.index < latestOurs.index) {
            return;
        }

        if (latestReceived.index === latestOurs.index) {

            // Samma block, vi har det redan
            if (latestReceived.hash === latestOurs.hash) {
                return;
            }

            // Fork: ett ensamt block avgör den inte, be om hela kedjan
            if (received.length === 1) {
                say(`block ${latestReceived.index} har samma index som vårt men annan hash, begär hela kedjan`);
                send(from, MESSAGE_TYPES.QUERY_ALL);
                return;
            }

            // Lika långa kedjor: lägst sista hash vinner. Byter vi minar
            // liggaren om våra poster och sprider dem. Byter vi inte är det
            // motparten som ska byta, så den får vår kedja och tillämpar
            // samma regel. Exakt en nod byter, så det blir ingen loop.
            // En ogiltig kedja, till exempel från en nod med annan
            // DIFFICULTY, besvaras inte, annars skickar noderna kedjor
            // fram och tillbaka utan slut.
            if (ledger.replaceChain(received)) {
                say(`fork vid block ${latestReceived.index}, bytte till kedjan med lägst sista hash`);
            } else if (received.length === ledger.getChain().length && ledger.getBlockchain().isChainValid(received)) {
                say(`fork vid block ${latestReceived.index}, behöll egen kedja och skickade den`);
                send(from, MESSAGE_TYPES.RESPONSE_BLOCKCHAIN, ledger.getChain());
            }

            return;
        }

        // Nästa block i vår kedja. Skickas vidare bara om det faktiskt
        // lades till, annars studsar samma block runt mellan noderna.
        if (latestReceived.previousHash === latestOurs.hash) {

            if (ledger.receiveBlock(latestReceived)) {
                say(`tog emot block ${latestReceived.index}`);
                broadcast(MESSAGE_TYPES.BROADCAST_BLOCK, latestReceived, from);
            }

            return;
        }

        // Ett ensamt block som inte passar på vårt senaste: vi ligger mer
        // än ett block efter, eller har en fork. Be om hela kedjan.
        if (received.length === 1) {
            say(`block ${latestReceived.index} passar inte efter vårt ${latestOurs.index}, begär hela kedjan`);
            send(from, MESSAGE_TYPES.QUERY_ALL);
            return;
        }

        // En hel kedja som är längre: liggaren byter om den är giltig och
        // minar om de egna poster som försvann i bytet.
        if (ledger.replaceChain(received)) {
            say(`bytte till mottagen kedja med ${received.length} block`);
            broadcast(MESSAGE_TYPES.RESPONSE_BLOCKCHAIN, [ledger.getBlockchain().getLatestBlock()], from);
        } else {
            say(`behöll egen kedja, den mottagna med ${received.length} block var inte längre och giltig`);
        }
    }


    function handleMessage(socket, raw) {

        let message;

        try {
            message = JSON.parse(raw);
        } catch (error) {
            say("ignorerade meddelande som inte är JSON");
            return;
        }

        if (!message || typeof message !== "object") {
            return;
        }

        switch (message.type) {

            case MESSAGE_TYPES.QUERY_LATEST:
                send(socket, MESSAGE_TYPES.RESPONSE_BLOCKCHAIN, [ledger.getBlockchain().getLatestBlock()]);
                break;

            case MESSAGE_TYPES.QUERY_ALL:
                send(socket, MESSAGE_TYPES.RESPONSE_BLOCKCHAIN, ledger.getChain());
                break;

            case MESSAGE_TYPES.RESPONSE_BLOCKCHAIN:
                handleBlocks(message.data, socket);
                break;

            case MESSAGE_TYPES.BROADCAST_BLOCK:
                handleBlocks([message.data], socket);
                break;

            default:
                say(`ignorerade okänd meddelandetyp ${message.type}`);
        }
    }


    // Gemensamt för inkommande och utgående anslutningar. Första steget
    // är alltid att fråga efter motpartens senaste block, så att en nod
    // som ligger efter kommer ikapp direkt.
    function initSocket(socket, label) {

        if (stopped) {
            socket.terminate();
            return;
        }

        sockets.add(socket);

        socket.on("message", raw => handleMessage(socket, raw.toString()));
        socket.on("close", () => {
            sockets.delete(socket);
            say(`${label} frånkopplad`);
        });
        socket.on("error", error => say(`${label}: ${error.message}`));

        say(`${label} ansluten`);
        send(socket, MESSAGE_TYPES.QUERY_LATEST);
    }


    // Utgående anslutning. Bryts den, eller går den inte att öppna,
    // görs ett nytt försök efter reconnectInterval tills noden stoppas.
    function connectToPeer(url) {

        if (stopped) {
            return;
        }

        const socket = new WebSocket(url);

        socket.on("open", () => initSocket(socket, url));

        socket.on("error", error => {
            if (socket.readyState !== WebSocket.OPEN) {
                say(`når inte ${url} (${error.code || error.message || "ingen anslutning"}), nytt försök om ${reconnectInterval / 1000} s`);
            }
        });

        socket.on("close", () => {

            if (stopped || reconnectTimers.has(url)) {
                return;
            }

            const timer = setTimeout(() => {
                reconnectTimers.delete(url);
                connectToPeer(url);
            }, reconnectInterval);

            reconnectTimers.set(url, timer);
        });
    }


    // Egna block sprids till alla anslutna noder. Block som kommit
    // utifrån skickas vidare i handleBlocks, därför bara origin local.
    function onBlock({ block, origin }) {
        if (origin === "local") {
            broadcast(MESSAGE_TYPES.BROADCAST_BLOCK, block);
        }
    }


    function start() {

        return new Promise((resolve, reject) => {

            server = new WebSocket.Server({ port });

            server.on("listening", () => {
                api.port = server.address().port;
                say(`lyssnar på port ${api.port}, peers: ${peers.join(", ") || "inga"}`);
                ledger.events.on("block", onBlock);
                peers.forEach(connectToPeer);
                resolve(api);
            });

            server.on("connection", (socket, request) => {
                initSocket(socket, `inkommande från ${request.socket.remoteAddress}:${request.socket.remotePort}`);
            });

            server.on("error", reject);
        });
    }


    function stop() {

        stopped = true;
        ledger.events.off("block", onBlock);

        reconnectTimers.forEach(timer => clearTimeout(timer));
        reconnectTimers.clear();

        sockets.forEach(socket => socket.terminate());
        sockets.clear();

        return new Promise(resolve => {
            if (server) {
                server.close(() => resolve());
            } else {
                resolve();
            }
        });
    }


    function getPeerCount() {
        return [...sockets].filter(socket => socket.readyState === WebSocket.OPEN).length;
    }


    const api = {
        port,
        peers,
        start,
        stop,
        connectToPeer,
        getPeerCount,
        broadcastBlock: block => broadcast(MESSAGE_TYPES.BROADCAST_BLOCK, block)
    };

    return api;
}


module.exports = {
    createP2PServer,
    MESSAGE_TYPES,
    RECONNECT_INTERVAL
};
