const ROLES = require("../config/role");


// Behörighetsreglerna, samlade på ett ställe så att routes, socket.io
// och tester använder samma logik. Allt här kontrolleras på servern,
// gränssnittet får aldrig vara den enda spärren.
//
// Roll            Söka  Läsa journal   Ser anteckningar  Skriva  Ser logg
// läkare          ja    alla           egna, staff, all  ja      ja
// sjuksköterska   ja    alla           egna, staff, all  ja      ja
// vårdcentral     ja    alla           all               nej     ja
// patient         nej   bara sin egen  all               nej     ja
// obehörig        nej   nej            nej               nej     nej
//
// Vårdcentralen tolkas som tillsynsroll: den får söka och läsa alla
// journaler och se loggen, men varken skriva eller se interna
// anteckningar.

const STAFF_ROLES = Object.freeze([ROLES.DOCTOR, ROLES.NURSE]);
const SEARCH_ROLES = Object.freeze([ROLES.DOCTOR, ROLES.NURSE, ROLES.CLINIC]);


function hasRole(user, roles) {
    return Boolean(user) && roles.includes(user.role);
}


function isStaff(user) {
    return hasRole(user, STAFF_ROLES);
}


function canSearch(user) {
    return hasRole(user, SEARCH_ROLES);
}


// Personal och vårdcentral får läsa alla journaler. En patient får bara
// läsa den journal kontot är kopplat till, oavsett vilket id som står i
// URL:en.
function canViewPatient(user, patientId) {

    if (!user) {
        return false;
    }

    if (canSearch(user)) {
        return true;
    }

    if (user.role === ROLES.PATIENT) {
        return user.patientId !== null
            && user.patientId !== undefined
            && Number(patientId) === Number(user.patientId);
    }

    return false;
}


function canWriteNotes(user) {
    return isStaff(user);
}


// Vilka synlighetsnivåer användaren får läsa. Egna anteckningar syns
// alltid för författaren, det löses i SQL-frågan med OR author_id = ?.
function readableVisibilities(user) {

    if (isStaff(user)) {
        return ["staff", "all"];
    }

    if (hasRole(user, [ROLES.CLINIC, ROLES.PATIENT])) {
        return ["all"];
    }

    return [];
}


// Alla som får läsa journalen får också se vem som varit inne i den
function canViewAccessLog(user, patientId) {
    return canViewPatient(user, patientId);
}


module.exports = {
    STAFF_ROLES,
    SEARCH_ROLES,
    isStaff,
    canSearch,
    canViewPatient,
    canWriteNotes,
    readableVisibilities,
    canViewAccessLog
};
