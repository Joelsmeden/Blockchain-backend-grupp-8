const validUsername = "Kalle";
const validPassword = "Anka";

const loginForm = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginError = document.getElementById("login-error");
const loginPage = document.getElementById("login-page");
const app = document.getElementById("app");
const logoutButton = document.getElementById("logout-button");
const currentUser = document.getElementById("current-user");

function login(username, password) {
    return username === validUsername && password === validPassword;
}

function showApplication(username) {
    loginPage.classList.add("hidden");
    app.classList.remove("hidden");
    currentUser.textContent = username;
}

function showLoginError() {
    loginError.classList.remove("hidden");
    passwordInput.value = "";
    passwordInput.focus();
}

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (login(username, password)) {
        loginError.classList.add("hidden");
        showApplication(username);
        return;
    }

    showLoginError();
});

logoutButton.addEventListener("click", () => {
    app.classList.add("hidden");
    loginPage.classList.remove("hidden");
    loginForm.reset();
    usernameInput.focus();
});

async function loginUser(username, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json();
  if (data.success) {
    console.log('Inloggad:', data.user.role);
  } else {
    alert(data.message);
  }
}