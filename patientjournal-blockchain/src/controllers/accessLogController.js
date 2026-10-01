const accessLogService = require("../services/accessLogService");


// GET /api/chain
function getChain(req, res) {

    const chain = accessLogService.getChain();

    res.json({
        success: true,
        length: chain.length,
        chain
    });
}


// GET /api/chain/verify
function verifyChain(req, res) {

    const report = accessLogService.verifyAll();

    res.json({
        success: true,
        message: report.valid
            ? "Liggaren stämmer med kedjan."
            : "Liggaren stämmer inte med kedjan.",
        ...report
    });
}


// GET /api/status
//
// nodeInfo och p2p sätts av server.js. Saknas de, som i test, svarar
// noden som ensam nod utan peers.
function getStatus(req, res) {

    const { nodeInfo = {}, p2p = null } = req.app.locals;
    const blockchain = accessLogService.getBlockchain();

    res.json({
        success: true,
        node: nodeInfo.name || "nod",
        port: nodeInfo.port ?? null,
        p2pPort: nodeInfo.p2pPort ?? null,
        peers: p2p ? p2p.getPeerCount() : 0,
        chainLength: blockchain.chain.length,
        latestHash: blockchain.getLatestBlock().hash,
        difficulty: blockchain.difficulty
    });
}


module.exports = {
    getChain,
    verifyChain,
    getStatus
};
