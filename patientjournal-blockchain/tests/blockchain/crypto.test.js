const { sha256, canonicalStringify } = require("../../src/blockchain/crypto");


describe("sha256", () => {

    test("ger känt värde för en känd sträng", () => {
        expect(sha256("abc")).toBe(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    });

    test("ger 64 hexadecimala tecken", () => {
        expect(sha256("vad som helst")).toMatch(/^[0-9a-f]{64}$/);
    });

    test("ger olika hash för olika strängar", () => {
        expect(sha256("a")).not.toBe(sha256("b"));
    });
});


describe("canonicalStringify", () => {

    test("ger samma sträng oavsett i vilken ordning fälten skapades", () => {
        const a = { userId: 1, patientId: 2, action: "READ" };
        const b = { action: "READ", patientId: 2, userId: 1 };

        expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
        expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    });

    test("sorterar nycklarna alfabetiskt", () => {
        expect(canonicalStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    });

    test("sorterar rekursivt i nästlade objekt", () => {
        const a = { outer: { z: 1, y: { b: 2, a: 3 } } };
        const b = { outer: { y: { a: 3, b: 2 }, z: 1 } };

        expect(canonicalStringify(a)).toBe(canonicalStringify(b));
        expect(canonicalStringify(a)).toBe('{"outer":{"y":{"a":3,"b":2},"z":1}}');
    });

    test("behåller ordningen i arrayer", () => {
        expect(canonicalStringify([3, 1, 2])).toBe("[3,1,2]");
        expect(canonicalStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
    });

    test("hanterar primitiva värden som JSON.stringify", () => {
        expect(canonicalStringify("text")).toBe('"text"');
        expect(canonicalStringify(42)).toBe("42");
        expect(canonicalStringify(true)).toBe("true");
        expect(canonicalStringify(null)).toBe("null");
    });

    test("hoppar över undefined i objekt och ger null i arrayer, som JSON.stringify", () => {
        expect(canonicalStringify({ a: 1, b: undefined })).toBe('{"a":1}');
        expect(canonicalStringify([1, undefined])).toBe("[1,null]");
    });

    test("ger samma resultat för ett objekt som gått via JSON", () => {
        const original = { noteId: undefined, role: "läkare", id: 7 };
        const fromNetwork = JSON.parse(JSON.stringify(original));

        expect(canonicalStringify(fromNetwork)).toBe(canonicalStringify(original));
    });

    test("går att läsa tillbaka till samma data", () => {
        const data = { id: 1, list: [1, { x: "å ä ö" }], nested: { ok: true } };

        expect(JSON.parse(canonicalStringify(data))).toEqual(data);
    });
});
