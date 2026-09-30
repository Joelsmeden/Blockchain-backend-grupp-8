
const {
    authenticateUser
} = require("../models/userModel");


// POST /api/login
function login(req, res) {

    const {
        username,
        password
    } = req.body;


    // Kontrollera att båda fälten finns
    if (!username || !password) {

        return res.status(400).json({
            success: false,
            message: "Användarnamn och lösenord krävs."
        });
    }


    // Försök logga in
    const user = authenticateUser(
        username,
        password
    );


    // Felaktiga uppgifter
    if (!user) {

        return res.status(401).json({
            success: false,
            message: "Felaktigt användarnamn eller lösenord."
        });
    }


    // Spara användaren i sessionen
    req.session.user = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        patientId: user.patientId
    };


    // Skicka information till frontend
    return res.status(200).json({
        success: true,
        message: "Inloggning lyckades.",
        user: req.session.user
    });
}


// POST /api/logout
function logout(req, res) {

    req.session.destroy((error) => {

        if (error) {

            return res.status(500).json({
                success: false,
                message: "Kunde inte logga ut."
            });
        }


        res.json({
            success: true,
            message: "Du är nu utloggad."
        });
    });
}


// GET /api/me
function getCurrentUser(req, res) {

    if (!req.session || !req.session.user) {

        return res.status(401).json({
            success: false,
            message: "Ingen användare är inloggad."
        });
    }


    res.json({
        success: true,
        user: req.session.user
    });
}


module.exports = {
    login,
    logout,
    getCurrentUser
};
