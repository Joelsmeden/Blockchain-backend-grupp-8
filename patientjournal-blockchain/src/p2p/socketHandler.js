const { Server } = require("socket.io");
const accessLogService = require("../services/accessLogService");
const { canViewPatient } = require("../services/accessControl");
const { parseId } = require("../services/patientService");


// Realtid till webbläsarna. Klienten går med i ett rum per patient,
// patient:<id>, och får veta när liggaren får ett block för den
// patienten, oavsett om blocket skapades på den här noden eller kom
// från en annan.
//
// Två olika händelser, annars uppstår en oändlig loop: varje hämtning
// av journalen loggas som en läsning, så om klienten hämtade om vid
// varje ny loggpost skulle hämtningen skapa en ny post, som fick
// klienten att hämta igen.
//
//   WRITE          → journal:updated   klienten hämtar om journalen
//   READ, DENIED   → access:logged     klienten lägger till posten i
//                                      sin lista utan att hämta något

const EVENTS = Object.freeze({
    JOIN: "patient:join",
    LEAVE: "patient:leave",
    JOURNAL_UPDATED: "journal:updated",
    ACCESS_LOGGED: "access:logged"
});


function roomFor(patientId) {
    return `patient:${patientId}`;
}


// Posten som skickas till webbläsarna. Raden från databasen har namn
// och tidpunkt. Saknas den, vilket bara händer om noden inte delar
// databas med den som skapade blocket, används fälten i blocket.
function entryForClients(block, entry) {

    if (entry) {
        return entry;
    }

    const { entryHash, ...fields } = block.data;

    return { ...fields, userName: null, entryHash, blockHash: block.hash };
}


function createSocketHandler({
    httpServer,
    sessionMiddleware,
    ledger = accessLogService,
    log = console.log
}) {

    const io = new Server(httpServer);


    // Kontrollera sessionen i handshaken. express-session körs på
    // handshake-anropet så att socket.request.session fylls i från
    // samma cookie som API:et använder.
    io.engine.use(sessionMiddleware);

    io.use((socket, next) => {

        const session = socket.request.session;

        if (!session || !session.user) {
            return next(new Error("Du måste vara inloggad."));
        }

        socket.data.user = session.user;
        next();
    });


    io.on("connection", (socket) => {

        const user = socket.data.user;

        // Går med i patientens rum. Samma kontroll som för API:et, så en
        // patient kan inte lyssna på någon annans journal.
        socket.on(EVENTS.JOIN, (patientId, callback = () => {}) => {

            const id = parseId(patientId);

            if (id === null || !canViewPatient(user, id)) {
                log(`${user.username} nekades rummet för patient ${patientId}`);
                return callback({ success: false, message: "Åtkomst nekad." });
            }

            // En klient lyssnar på en patient i taget
            socket.rooms.forEach(room => {
                if (room.startsWith("patient:")) {
                    socket.leave(room);
                }
            });

            socket.join(roomFor(id));
            callback({ success: true, message: `Lyssnar på patient ${id}.`, patientId: id });
        });

        socket.on(EVENTS.LEAVE, (patientId, callback = () => {}) => {
            socket.leave(roomFor(Number(patientId)));
            callback({ success: true, message: "Slutade lyssna." });
        });
    });


    // När liggaren får ett block, lokalt eller utifrån, meddela rummet
    function onBlock({ block, entry }) {

        const { patientId, action, noteId } = block.data;
        const room = io.to(roomFor(patientId));
        const payload = entryForClients(block, entry);

        if (action === "WRITE") {
            room.emit(EVENTS.JOURNAL_UPDATED, { patientId, noteId, entry: payload });
        } else {
            room.emit(EVENTS.ACCESS_LOGGED, payload);
        }
    }

    ledger.events.on("block", onBlock);


    function close() {
        ledger.events.off("block", onBlock);
        return new Promise(resolve => io.close(() => resolve()));
    }


    return { io, close };
}


module.exports = {
    createSocketHandler,
    EVENTS,
    roomFor
};
