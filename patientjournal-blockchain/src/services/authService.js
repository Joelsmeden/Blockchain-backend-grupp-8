const crypto = require("crypto");


// Lösenord hashas med scrypt och ett slumpat salt per användare.
// Samma funktioner används av seed-scriptet och vid inloggning, så att
// hashen alltid räknas ut på samma sätt.

const KEY_LENGTH = 64;

// Arbetsfaktorn för scrypt. Standardvärdet 16384 gör varje hash dyr
// med flit. I test sänks den, annars tar seeden över en sekund varje
// gång en testfil nollställer databasen.
const SCRYPT_OPTIONS = {
    N: process.env.NODE_ENV === "test" ? 1024 : 16384
};


function hashPassword(password) {

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS).toString("hex");

    return { hash, salt };
}


function verifyPassword(password, hash, salt) {

    const stored = Buffer.from(hash, "hex");
    const candidate = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);

    // timingSafeEqual kräver lika långa buffertar och kastar annars
    if (stored.length !== candidate.length) {
        return false;
    }

    return crypto.timingSafeEqual(stored, candidate);
}


module.exports = {
    hashPassword,
    verifyPassword
};
