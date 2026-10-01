const path = require("path");
const express = require("express");
const session = require("express-session");

const authRoutes = require("./routes/authRoutes");
const patientRoutes = require("./routes/patientRoutes");
const noteRoutes = require("./routes/noteRoutes");
const accessLogRoutes = require("./routes/accessLogRoutes");


// Bygger Express-appen utan att lyssna på någon port. server.js startar
// den, testerna kör den direkt med supertest.

const app = express();


// Två noder på localhost delar cookies, eftersom webbläsaren inte
// skiljer på portar. Ett eget cookienamn per nod gör att man kan vara
// inloggad på båda samtidigt.
const sessionMiddleware = session({
    name: "patientjournal.sid" + (process.env.PORT ? "." + process.env.PORT : ""),
    secret: process.env.SESSION_SECRET || "byt-ut-i-produktion",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000
    }
});

app.use(express.json());
app.use(sessionMiddleware);


// Frontend
app.use(express.static(path.join(__dirname, "..", "public")));


// API
app.use("/api", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/patients", noteRoutes);
app.use("/api", accessLogRoutes);


// Okänd API-väg
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "Hittades inte."
    });
});


// Fel som kastats i en route, till exempel ogiltig JSON i anropet eller
// ett databasfel. Svaret följer samma format som resten av API:et.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {

    const status = error.status || error.statusCode || 500;

    if (status >= 500) {
        console.error(error);
    }

    let message = error.message;

    if (error.type === "entity.parse.failed") {
        message = "Ogiltig JSON i anropet.";
    } else if (status >= 500) {
        message = "Internt fel.";
    }

    res.status(status).json({
        success: false,
        message
    });
});


// socket.io behöver samma sessionshantering för att känna igen
// användaren i handshaken
app.locals.sessionMiddleware = sessionMiddleware;


module.exports = app;
