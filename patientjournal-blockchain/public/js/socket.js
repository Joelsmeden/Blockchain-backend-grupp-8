// Realtid med socket.io. io() utan argument ansluter till samma nod som
// sidan, och cookien följer med så att noden känner igen sessionen.
// Klienten lyssnar på en patient i taget, rummet patient:<id>.
//
// Två händelser, med flit:
//   journal:updated  en anteckning skrevs, hämta om journalen
//   access:logged    en läsning eller nekad åtkomst, lägg bara till
//                    posten i loggen. Hämtades journalen om här skulle
//                    hämtningen själv loggas och utlösa nästa händelse.

(() => {

    let socket = null;
    let joinedPatientId = null;


    function connect() {

        if (socket || typeof io !== "function") {
            return;
        }

        socket = io();

        // Vid anslutning, och återanslutning, gå med i rummet för den
        // journal som är öppen
        socket.on("connect", () => {
            if (App.state.patientId) {
                join(App.state.patientId);
            }
        });

        socket.on("disconnect", () => {
            joinedPatientId = null;
        });

        socket.on("journal:updated", ({ patientId }) => {
            if (patientId === App.state.patientId) {
                Patients.open(patientId);
            }
        });

        socket.on("access:logged", (entry) => {
            if (entry.patientId === App.state.patientId) {
                AccessLogs.prepend(entry);
            }
        });
    }


    function join(patientId) {

        if (!socket || !socket.connected) {
            return;
        }

        socket.emit("patient:join", patientId, (reply) => {
            joinedPatientId = reply && reply.success ? reply.patientId : null;
        });
    }


    function disconnect() {
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        joinedPatientId = null;
    }


    function isJoined(patientId) {
        return socket !== null && socket.connected && joinedPatientId === Number(patientId);
    }


    window.Socket = { connect, disconnect, join, isJoined };

})();
