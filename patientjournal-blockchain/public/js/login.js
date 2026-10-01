// Inloggning, utloggning och session mot API:et. Cookien följer med
// automatiskt eftersom anropen går till samma nod som sidan.

(() => {

    async function postJson(url, body) {
        const options = { method: "POST" };
        if (body !== undefined) {
            options.headers = { "Content-Type": "application/json" };
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        return response.json();
    }


    // Returnerar API:ets svar: { success, user } eller { success, message }
    async function login(username, password) {
        try {
            return await postJson("/api/login", { username, password });
        } catch (error) {
            return { success: false, message: "Kunde inte nå servern." };
        }
    }

    async function logout() {
        try {
            await postJson("/api/logout");
        } catch (error) {
            // Sessionen rensas lokalt oavsett
        }
    }

    // Inloggad användare från sessionen, eller null
    async function currentUser() {
        try {
            const response = await fetch("/api/me");
            if (!response.ok) {
                return null;
            }
            const data = await response.json();
            return data.success ? data.user : null;
        } catch (error) {
            return null;
        }
    }

    // Vid sidladdning: fortsätt där sessionen är, annars inloggningssidan
    async function restore() {
        const user = await currentUser();
        if (user) {
            App.start(user);
        } else {
            App.showLogin();
        }
    }


    window.Login = { login, logout, currentUser, restore };

})();
