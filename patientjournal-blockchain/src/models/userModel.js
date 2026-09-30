
// Tillfällig användardata.
// Denna kommer senare att ersättas med SQL-databasen.

const users = [
    {
        id: 1,
        username: "doctor",
        password: "1234",
        name: "Anna Andersson",
        role: "läkare",
        patientId: null
    },

    {
        id: 2,
        username: "nurse",
        password: "1234",
        name: "Erik Svensson",
        role: "sjuksköterska",
        patientId: null
    },

    {
        id: 3,
        username: "clinic",
        password: "1234",
        name: "Vårdcentral A",
        role: "vårdcentral",
        patientId: null
    },

    {
        id: 4,
        username: "patient",
        password: "1234",
        name: "Lisa Karlsson",
        role: "patient",
        patientId: 1
    },

    {
        id: 5,
        username: "unauthorized",
        password: "1234",
        name: "Obehörig användare",
        role: "obehörig",
        patientId: null
    }
];


// Hitta användare med användarnamn
function findUserByUsername(username) {
    return users.find(user => user.username === username);
}


// Hitta användare med ID
function findUserById(id) {
    return users.find(user => user.id === id);
}


// Kontrollera login
function authenticateUser(username, password) {

    const user = findUserByUsername(username);

    if (!user) {
        return null;
    }

    if (user.password !== password) {
        return null;
    }

    return user;
}


module.exports = {
    users,
    findUserByUsername,
    findUserById,
    authenticateUser
};

