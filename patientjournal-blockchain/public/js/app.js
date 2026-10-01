// Start, vyväxling och session. Laddas först. De andra filerna i
// public/js lägger sina funktioner på window och anropas härifrån när
// sidan är klar.

const loginForm = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("login-error");
const loginPage = document.getElementById("login-page");
const app = document.getElementById("app");
const logoutButton = document.getElementById("logout-button");
const currentUser = document.getElementById("current-user");
const currentRole = document.getElementById("current-role");
const userAvatar = document.querySelector(".user-avatar");
const nodeSelect = document.getElementById("node-select");
const searchCard = document.querySelector(".search-card");
const patientCard = document.querySelector(".patient-card");
const dashboardGrid = document.querySelector(".dashboard-grid");
const newNoteSection = document.getElementById("new-note-section");
const newNoteButton = document.getElementById("new-note-button");
const accessDenied = document.getElementById("access-denied");
const accessDeniedButton = accessDenied.querySelector("button");

const STAFF_ROLES = ["läkare", "sjuksköterska"];
const SEARCH_ROLES = ["läkare", "sjuksköterska", "vårdcentral"];

// Inloggad användare och öppnad journal, delas med de andra filerna
const state = { user: null, patientId: null };


function show(element) {
    element.classList.remove("hidden");
}

function hide(element) {
    element.classList.add("hidden");
}

function isStaff(user) {
    return Boolean(user) && STAFF_ROLES.includes(user.role);
}

function canSearch(user) {
    return Boolean(user) && SEARCH_ROLES.includes(user.role);
}

// Skapar ett element med text, aldrig HTML, så att innehåll från
// databasen inte kan tolkas som markup
function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text !== undefined && text !== null) {
        element.textContent = text;
    }
    return element;
}

function initials(name) {
    return String(name || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(word => word[0].toUpperCase())
        .join("") || "?";
}

function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value || "";
    }
    return date.toLocaleString("sv-SE", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit"
    });
}


function showApplication(user) {
    loginPage.classList.add("hidden");
    app.classList.remove("hidden");
    currentUser.textContent = user.name;
    currentRole.textContent = user.role;
    userAvatar.textContent = initials(user.name);
}

function showLoginError(message) {
    loginError.textContent = message || "Felaktiga inloggningsuppgifter.";
    loginError.classList.remove("hidden");
    passwordInput.value = "";
    passwordInput.focus();
}

function showLogin() {
    state.user = null;
    state.patientId = null;
    app.classList.add("hidden");
    loginPage.classList.remove("hidden");
    loginForm.reset();
    loginError.classList.add("hidden");
    usernameInput.focus();
}

function clearPatient() {
    state.patientId = null;
    hide(patientCard);
    hide(dashboardGrid);
    hide(newNoteSection);
    hide(accessDenied);
    document.getElementById("notes-list").replaceChildren();
    document.getElementById("access-log-list").replaceChildren();
    document.getElementById("search-results").replaceChildren();
}

function showPatient() {
    hide(accessDenied);
    show(patientCard);
    show(dashboardGrid);
}

function showDenied() {
    hide(patientCard);
    hide(dashboardGrid);
    hide(newNoteSection);
    show(accessDenied);
}


// Vyn efter inloggning styrs av rollen. Behörigheten avgörs alltid på
// servern, det här avgör bara vad som visas.
function start(user) {
    state.user = user;
    clearPatient();
    showApplication(user);
    newNoteButton.classList.toggle("hidden", !isStaff(user));
    Socket.connect();

    if (user.role === "obehörig") {
        hide(searchCard);
        showDenied();
        return;
    }

    if (canSearch(user)) {
        show(searchCard);
        Patients.focus();
        return;
    }

    // Patient: direkt till den egna journalen, ingen sökruta
    hide(searchCard);
    if (user.patientId) {
        Patients.open(user.patientId);
    } else {
        showDenied();
    }
}


loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    const result = await Login.login(username, password);

    if (result.success) {
        loginError.classList.add("hidden");
        start(result.user);
        return;
    }

    showLoginError(result.message);
});

logoutButton.addEventListener("click", async () => {
    await Login.logout();
    Socket.disconnect();
    clearPatient();
    showLogin();
});

accessDeniedButton.addEventListener("click", () => {
    if (canSearch(state.user)) {
        hide(accessDenied);
        Patients.focus();
        return;
    }
    logoutButton.click();
});


// Nodväljaren byter till den andra serverns adress. Sessionen är per
// nod, så man loggar in på nytt där.
if ([...nodeSelect.options].some(option => option.value === location.port)) {
    nodeSelect.value = location.port;
}

nodeSelect.addEventListener("change", () => {
    if (nodeSelect.value !== location.port) {
        location.href = `${location.protocol}//${location.hostname}:${nodeSelect.value}${location.pathname}`;
    }
});


window.App = {
    state,
    STAFF_ROLES,
    SEARCH_ROLES,
    el,
    formatTime,
    show,
    hide,
    isStaff,
    canSearch,
    start,
    showLogin,
    showPatient,
    showDenied,
    clearPatient
};


// Återställ sessionen när alla filer laddats
document.addEventListener("DOMContentLoaded", () => Login.restore());
