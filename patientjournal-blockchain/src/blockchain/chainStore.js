const fs = require("fs");
const path = require("path");


// Kedjan ligger i minnet. Varje nod sparar därför sin kedja i en egen
// fil, data/chain-<P2P_PORT>.json, efter varje nytt block och läser in
// den vid start. Utan det skulle en omstartad nod bara ha genesis kvar
// medan databasen har alla rader, och verifieringen skulle underkänna
// allt.
//
// I test skrivs ingen fil, om inte CHAIN_DIR anges uttryckligen.

const DEFAULT_DIR = path.join(__dirname, "..", "..", "data");

const dir = process.env.CHAIN_DIR
    || (process.env.NODE_ENV === "test" ? null : DEFAULT_DIR);

const fileName = `chain-${process.env.P2P_PORT || "default"}.json`;
const filePath = dir ? path.join(dir, fileName) : null;


function isEnabled() {
    return filePath !== null;
}


// Skriver till en temporär fil som sedan byter namn, så att en krasch
// mitt i skrivningen inte lämnar en halv fil efter sig.
function save(chain) {

    if (!filePath) {
        return false;
    }

    fs.mkdirSync(dir, { recursive: true });

    const tmpPath = filePath + ".tmp";

    fs.writeFileSync(tmpPath, JSON.stringify(chain));
    fs.renameSync(tmpPath, filePath);

    return true;
}


// Returnerar kedjan som vanliga objekt, eller null om filen saknas eller
// inte går att läsa. Om kedjan är giltig avgörs av Blockchain.replaceChain.
function load() {

    if (!filePath || !fs.existsSync(filePath)) {
        return null;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        return null;
    }
}


// Tar bort alla noders kedjefiler. Används när databasen seedas från
// tomt, eftersom en gammal kedja då pekar på rader som inte finns.
function clearAll() {

    if (!dir || !fs.existsSync(dir)) {
        return 0;
    }

    const files = fs.readdirSync(dir).filter(name => /^chain-.+\.json$/.test(name));

    files.forEach(name => fs.unlinkSync(path.join(dir, name)));

    return files.length;
}


module.exports = {
    filePath,
    isEnabled,
    save,
    load,
    clearAll
};
