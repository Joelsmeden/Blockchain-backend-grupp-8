const crypto = require("crypto");


// Lösenord hashas med scrypt och ett slumpat salt per användare.
// Samma funktioner används av seed-scriptet och vid inloggning, så att
// hashen alltid räknas ut på samma sätt.

const KEY_LENGTH = 64;


function hashPassword(password) {

    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString("hex");

    return { hash, salt };
}


function verifyPassword(password, hash, salt) {

    const stored = Buffer.from(hash, "hex");
    const candidate = crypto.scryptSync(password, salt, KEY_LENGTH);

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
