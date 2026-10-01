const db = require("../config/database");
const { hashPassword } = require("../services/authService");
const chainStore = require("../blockchain/chainStore");


// Demodata. Körs automatiskt vid start om databasen är tom,
// eller manuellt med: npm run seed
//
// Alla konton har lösenordet 1234.
// Användarna är samma som i models/userModel.js, plus ett andra
// patientkonto så att det går att visa att en patient inte kommer åt
// någon annans journal.

const patients = [
    { id: 1, personalNumber: "19850412-2384", firstName: "Lisa",  lastName: "Karlsson", dateOfBirth: "1985-04-12" },
    { id: 2, personalNumber: "19720930-1157", firstName: "Johan", lastName: "Nilsson",  dateOfBirth: "1972-09-30" },
    { id: 3, personalNumber: "20010217-4466", firstName: "Maria", lastName: "Lindqvist", dateOfBirth: "2001-02-17" }
];

const users = [
    { id: 1, username: "doctor",       password: "1234", name: "Anna Andersson",     role: "läkare",        patientId: null },
    { id: 2, username: "nurse",        password: "1234", name: "Erik Svensson",      role: "sjuksköterska", patientId: null },
    { id: 3, username: "clinic",       password: "1234", name: "Vårdcentral A",      role: "vårdcentral",   patientId: null },
    { id: 4, username: "patient",      password: "1234", name: "Lisa Karlsson",      role: "patient",       patientId: 1 },
    { id: 5, username: "unauthorized", password: "1234", name: "Obehörig användare", role: "obehörig",      patientId: null },
    { id: 6, username: "patient2",     password: "1234", name: "Johan Nilsson",      role: "patient",       patientId: 2 }
];

const notes = [
    // Lisa Karlsson: en anteckning per synlighetsnivå
    {
        patientId: 1, authorId: 1, visibility: "all",
        title: "Årskontroll",
        content: "Blodtryck 125/80. Patienten mår bra och har inga nya besvär. Återbesök om ett år."
    },
    {
        patientId: 1, authorId: 2, visibility: "staff",
        title: "Provtagning",
        content: "Blodprover tagna enligt ordination. Svar väntas inom tre dagar."
    },
    {
        patientId: 1, authorId: 1, visibility: "private",
        title: "Arbetsanteckning",
        content: "Överväg remiss till kardiolog om nästa blodtrycksmätning också ligger högt."
    },

    // Johan Nilsson
    {
        patientId: 2, authorId: 1, visibility: "all",
        title: "Diabeteskontroll",
        content: "HbA1c 52 mmol/mol, stabilt sedan förra besöket. Fortsätter med nuvarande behandling."
    },
    {
        patientId: 2, authorId: 2, visibility: "staff",
        title: "Fotundersökning",
        content: "Ingen nedsatt känsel i fötterna. Inga sår."
    },

    // Maria Lindqvist
    {
        patientId: 3, authorId: 1, visibility: "all",
        title: "Nybesök",
        content: "Söker för återkommande huvudvärk. Inga neurologiska fynd. Råd om sömn och vätskeintag."
    }
];


const insertPatient = db.prepare(`
    INSERT INTO patients (id, personal_number, first_name, last_name, date_of_birth)
    VALUES (@id, @personalNumber, @firstName, @lastName, @dateOfBirth)
`);

const insertUser = db.prepare(`
    INSERT INTO users (id, username, password_hash, password_salt, name, role, patient_id)
    VALUES (@id, @username, @hash, @salt, @name, @role, @patientId)
`);

const insertNote = db.prepare(`
    INSERT INTO notes (patient_id, author_id, title, content, visibility)
    VALUES (@patientId, @authorId, @title, @content, @visibility)
`);


// Allt eller inget. Returnerar true om data lades in, false om databasen
// redan hade användare.
const insertDemoData = db.transaction(() => {

    const { count } = db.prepare("SELECT COUNT(*) AS count FROM users").get();

    if (count > 0) {
        return false;
    }

    patients.forEach(patient => insertPatient.run(patient));

    users.forEach(user => {
        const { hash, salt } = hashPassword(user.password);
        insertUser.run({ ...user, hash, salt });
    });

    notes.forEach(note => insertNote.run(note));

    return true;
});


// När databasen seedas från tomt tas gamla kedjefiler bort, eftersom en
// sparad kedja då pekar på loggrader som inte längre finns.
function seed() {

    // immediate tar skrivlåset direkt. Startas två noder samtidigt mot en
    // tom databas väntar då den andra på den första och ser sedan att
    // data redan finns, i stället för att få SQLITE_BUSY mitt i.
    const seeded = insertDemoData.immediate();

    if (seeded) {
        chainStore.clearAll();
    }

    return seeded;
}


if (require.main === module) {
    const seeded = seed();
    console.log(seeded
        ? `Demodata inlagd: ${patients.length} patienter, ${users.length} användare, ${notes.length} anteckningar.`
        : "Databasen har redan data, inget gjordes.");
}


module.exports = seed;
