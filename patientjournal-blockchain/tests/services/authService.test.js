const userModel = require("../../src/models/userModel");


let authService;

beforeAll(() => {
    require("../../src/database/seed")();
    authService = require("../../src/services/authService");
});


describe("hashPassword och verifyPassword", () => {

    test("ger nytt salt och ny hash varje gång, även för samma lösenord", () => {
        const first = authService.hashPassword("1234");
        const second = authService.hashPassword("1234");

        expect(first.salt).not.toBe(second.salt);
        expect(first.hash).not.toBe(second.hash);
        expect(first.hash).toMatch(/^[0-9a-f]{128}$/);
        expect(first.salt).toMatch(/^[0-9a-f]{32}$/);
    });

    test("verifierar rätt lösenord och avvisar fel", () => {
        const { hash, salt } = authService.hashPassword("hemligt");

        expect(authService.verifyPassword("hemligt", hash, salt)).toBe(true);
        expect(authService.verifyPassword("Hemligt", hash, salt)).toBe(false);
        expect(authService.verifyPassword("", hash, salt)).toBe(false);
    });

    test("avvisar en hash med fel längd utan att kasta", () => {
        const { salt } = authService.hashPassword("hemligt");

        expect(authService.verifyPassword("hemligt", "abcd", salt)).toBe(false);
    });
});


describe("authenticateUser", () => {

    test.each(userModel.users.map(user => [user.username]))(
        "returnerar samma objekt som userModel.authenticateUser för %s, utan lösenord",
        (username) => {
            const { password, ...expected } = userModel.authenticateUser(username, "1234");

            expect(authService.authenticateUser(username, "1234")).toEqual(expected);
        }
    );

    test("innehåller inga lösenordsfält", () => {
        const user = authService.authenticateUser("doctor", "1234");

        expect(Object.keys(user).sort()).toEqual(["id", "name", "patientId", "role", "username"]);
    });

    test("hittar även användare som bara finns i databasen", () => {
        expect(authService.authenticateUser("patient2", "1234")).toEqual({
            id: 6,
            username: "patient2",
            name: "Johan Nilsson",
            role: "patient",
            patientId: 2
        });
    });

    test("ger null vid fel lösenord", () => {
        expect(authService.authenticateUser("doctor", "fel")).toBeNull();
    });

    test("ger null för okänd användare", () => {
        expect(authService.authenticateUser("finnsinte", "1234")).toBeNull();
    });

    test("ger null när användarnamn eller lösenord saknas", () => {
        expect(authService.authenticateUser(undefined, "1234")).toBeNull();
        expect(authService.authenticateUser("doctor", undefined)).toBeNull();
    });
});
