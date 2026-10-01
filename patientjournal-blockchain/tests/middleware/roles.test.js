const ROLES = require("../../src/config/role");
const {
    STAFF_ROLES,
    SEARCH_ROLES,
    isStaff,
    canSearch,
    canViewPatient,
    canWriteNotes,
    readableVisibilities,
    canViewAccessLog
} = require("../../src/services/accessControl");


// Varje roll mot varje kolumn i behörighetstabellen.

const doctor = { id: 1, role: ROLES.DOCTOR, patientId: null };
const nurse = { id: 2, role: ROLES.NURSE, patientId: null };
const clinic = { id: 3, role: ROLES.CLINIC, patientId: null };
const patient = { id: 4, role: ROLES.PATIENT, patientId: 1 };
const unauthorized = { id: 5, role: ROLES.UNAUTHORIZED, patientId: null };

const table = [
    // roll            användare     söka   egen   andra  anteckningar       skriva  logg
    ["läkare",         doctor,       true,  true,  true,  ["staff", "all"],  true,   true],
    ["sjuksköterska",  nurse,        true,  true,  true,  ["staff", "all"],  true,   true],
    ["vårdcentral",    clinic,       true,  true,  true,  ["all"],           false,  true],
    ["patient",        patient,      false, true,  false, ["all"],           false,  true],
    ["obehörig",       unauthorized, false, false, false, [],                false,  false]
];


describe("rollistorna", () => {

    test("STAFF_ROLES är läkare och sjuksköterska", () => {
        expect([...STAFF_ROLES]).toEqual([ROLES.DOCTOR, ROLES.NURSE]);
    });

    test("SEARCH_ROLES är läkare, sjuksköterska och vårdcentral", () => {
        expect([...SEARCH_ROLES]).toEqual([ROLES.DOCTOR, ROLES.NURSE, ROLES.CLINIC]);
    });

    test("listorna kan inte ändras", () => {
        expect(Object.isFrozen(STAFF_ROLES)).toBe(true);
        expect(Object.isFrozen(SEARCH_ROLES)).toBe(true);
    });
});


describe.each(table)("%s", (role, user, search, ownJournal, otherJournal, visibilities, write, log) => {

    test(`söka: ${search ? "ja" : "nej"}`, () => {
        expect(canSearch(user)).toBe(search);
    });

    test(`läsa sin egen journal: ${ownJournal ? "ja" : "nej"}`, () => {
        // Patientens egen journal är patient 1, övriga roller har ingen
        // egen journal och testas mot en godtycklig
        expect(canViewPatient(user, 1)).toBe(ownJournal);
    });

    test(`läsa någon annans journal: ${otherJournal ? "ja" : "nej"}`, () => {
        expect(canViewPatient(user, 2)).toBe(otherJournal);
        expect(canViewPatient(user, 3)).toBe(otherJournal);
    });

    test(`ser anteckningar: ${visibilities.join(", ") || "inga"}`, () => {
        expect(readableVisibilities(user)).toEqual(visibilities);
    });

    test(`skriva: ${write ? "ja" : "nej"}`, () => {
        expect(canWriteNotes(user)).toBe(write);
    });

    test(`ser logg: ${log ? "ja" : "nej"}`, () => {
        expect(canViewAccessLog(user, 1)).toBe(log);
    });

    test(`är personal: ${write ? "ja" : "nej"}`, () => {
        expect(isStaff(user)).toBe(write);
    });
});


describe("canViewPatient för patienter", () => {

    test("jämför numeriskt, så id från URL:en som sträng fungerar", () => {
        expect(canViewPatient(patient, "1")).toBe(true);
        expect(canViewPatient(patient, "2")).toBe(false);
    });

    test("nekar en patient utan kopplad journal", () => {
        expect(canViewPatient({ role: ROLES.PATIENT, patientId: null }, 1)).toBe(false);
        expect(canViewPatient({ role: ROLES.PATIENT }, 1)).toBe(false);
    });

    test("nekar när id inte är ett tal", () => {
        expect(canViewPatient(patient, "abc")).toBe(false);
        expect(canViewPatient(patient, undefined)).toBe(false);
    });

    test("en annan patient kommer inte åt patient 1", () => {
        expect(canViewPatient({ id: 6, role: ROLES.PATIENT, patientId: 2 }, 1)).toBe(false);
    });
});


describe("private syns aldrig via synlighetsnivå", () => {

    test.each(table)("%s får inte private i sin lista", (role, user) => {
        expect(readableVisibilities(user)).not.toContain("private");
    });
});


describe("utan användare eller med okänd roll", () => {

    test.each([
        ["ingen användare", null],
        ["undefined", undefined],
        ["utan roll", { id: 9 }],
        ["okänd roll", { id: 9, role: "admin" }]
    ])("%s nekas allt", (label, user) => {
        expect(canSearch(user)).toBe(false);
        expect(canViewPatient(user, 1)).toBe(false);
        expect(canWriteNotes(user)).toBe(false);
        expect(readableVisibilities(user)).toEqual([]);
        expect(canViewAccessLog(user, 1)).toBe(false);
        expect(isStaff(user)).toBe(false);
    });
});
