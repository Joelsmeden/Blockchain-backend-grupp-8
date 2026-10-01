const noteModel = require("../models/noteModel");
const { readableVisibilities } = require("./accessControl");


const VISIBILITIES = Object.freeze(["private", "staff", "all"]);
const DEFAULT_VISIBILITY = "staff";

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 10000;


// Returnerar ett felmeddelande, eller null om anteckningen är giltig
function validateNote({ title, content, visibility } = {}) {

    if (typeof title !== "string" || !title.trim()) {
        return "Rubrik krävs.";
    }

    if (title.trim().length > MAX_TITLE_LENGTH) {
        return `Rubriken får vara högst ${MAX_TITLE_LENGTH} tecken.`;
    }

    if (typeof content !== "string" || !content.trim()) {
        return "Innehåll krävs.";
    }

    if (content.trim().length > MAX_CONTENT_LENGTH) {
        return `Innehållet får vara högst ${MAX_CONTENT_LENGTH} tecken.`;
    }

    if (visibility !== undefined && !VISIBILITIES.includes(visibility)) {
        return "Synlighet måste vara private, staff eller all.";
    }

    return null;
}


// Anteckningarna användaren får se för en patient. Behörigheten att
// över huvud taget öppna journalen kontrolleras innan detta anropas.
function getNotesForUser(user, patientId) {
    return noteModel.findForReader(Number(patientId), readableVisibilities(user), user.id);
}


function createNote(user, patientId, { title, content, visibility = DEFAULT_VISIBILITY }) {

    return noteModel.create({
        patientId: Number(patientId),
        authorId: user.id,
        title: title.trim(),
        content: content.trim(),
        visibility
    });
}


module.exports = {
    VISIBILITIES,
    DEFAULT_VISIBILITY,
    validateNote,
    getNotesForUser,
    createNote
};
