const crypto = require("crypto");


function sha256(input) {
    return crypto.createHash("sha256").update(String(input)).digest("hex");
}


// Serialiserar JSON med nycklarna i alfabetisk ordning, rekursivt.
// JSON.stringify behåller den ordning fälten råkar ha skapats i, så samma
// data kan ge olika strängar på olika noder och därmed olika hashar.
// Här får samma data alltid samma sträng.
//
// Följer JSON.stringify i övrigt: undefined hoppas över i objekt och blir
// null i arrayer, så ett block som skickats som JSON hashas likadant som
// originalet.
function canonicalStringify(value) {

    if (Array.isArray(value)) {
        const items = value.map(item =>
            item === undefined ? "null" : canonicalStringify(item)
        );
        return "[" + items.join(",") + "]";
    }

    if (value !== null && typeof value === "object") {
        const entries = Object.keys(value)
            .filter(key => value[key] !== undefined)
            .sort()
            .map(key => JSON.stringify(key) + ":" + canonicalStringify(value[key]));
        return "{" + entries.join(",") + "}";
    }

    return JSON.stringify(value);
}


module.exports = {
    sha256,
    canonicalStringify
};
