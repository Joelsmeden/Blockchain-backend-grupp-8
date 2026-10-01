const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { freshApp, api } = require("../helpers/api");


// Gränssnittet är vanlig JavaScript i webbläsaren utan byggsteg. Här
// kontrolleras att servern serverar det, att sidan laddar alla filer i
// public/js och att varje fil går att tolka.

const publicDir = path.join(__dirname, "..", "..", "public");
const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);

let app;

beforeAll(() => {
    app = freshApp();
});


describe("frontend", () => {

    test("startsidan serveras med inloggning, sökning, formulär och logg", async () => {
        const response = await api(app).get("/").expect(200);

        expect(response.headers["content-type"]).toMatch(/text\/html/);

        ["login-form", "node-select", "patient-search", "search-results",
            "notes-list", "note-form", "note-title", "note-text", "note-visibility",
            "access-log-list", "access-denied"].forEach(id => {
            expect(response.text).toContain(`id="${id}"`);
        });
    });

    test("sidan laddar socket.io-klienten först och sedan varje fil i public/js", () => {
        expect(scripts[0]).toBe("/socket.io/socket.io.js");

        const files = fs.readdirSync(path.join(publicDir, "js")).map(name => "/js/" + name).sort();
        expect(scripts.slice(1).sort()).toEqual(files);
    });

    test.each(scripts.filter(src => src.startsWith("/js/")))("%s serveras och går att tolka", async (src) => {
        const response = await api(app).get(src).expect(200);

        expect(response.text.length).toBeGreaterThan(0);
        expect(() => new vm.Script(response.text, { filename: src })).not.toThrow();
    });

    test("stilmallen serveras", async () => {
        await api(app).get("/css/style.css").expect(200);
    });

    test("synlighetsvalen i formuläret är API:ets värden", () => {
        const select = html.slice(html.indexOf('id="note-visibility"'), html.indexOf("</select>", html.indexOf('id="note-visibility"')));
        const values = [...select.matchAll(/value="([^"]+)"/g)].map(match => match[1]);

        expect(values).toEqual(["private", "staff", "all"]);
    });
});
