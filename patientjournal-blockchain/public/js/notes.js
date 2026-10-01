// Visar journalens anteckningar och låter personal skriva nya. Vilka
// anteckningar som syns avgör servern utifrån rollen och synligheten.

(() => {

    const notesList = document.getElementById("notes-list");
    const newNoteButton = document.getElementById("new-note-button");
    const newNoteSection = document.getElementById("new-note-section");
    const noteForm = document.getElementById("note-form");
    const noteTitle = document.getElementById("note-title");
    const noteText = document.getElementById("note-text");
    const noteVisibility = document.getElementById("note-visibility");
    const noteError = document.getElementById("note-error");
    const cancelNoteButton = document.getElementById("cancel-note-button");

    // API:ets värde → klass och etikett i gränssnittet
    const VISIBILITY = {
        private: { className: "visibility", label: "Endast mig" },
        staff: { className: "visibility medical", label: "Endast sjukvårdspersonal" },
        all: { className: "visibility public", label: "Synlig för alla" }
    };


    function render(notes) {

        notesList.replaceChildren();

        if (!notes.length) {
            notesList.append(App.el("p", "subtitle", "Inga anteckningar att visa."));
            return;
        }

        notes.forEach(note => notesList.append(renderNote(note)));
    }


    function renderNote(note) {

        const article = App.el("article", "note");

        const header = App.el("div", "note-header");
        const heading = App.el("div");
        heading.append(
            App.el("strong", null, note.title),
            App.el("span", "note-role", `${note.authorName}, ${note.authorRole}`)
        );
        header.append(heading, App.el("time", null, App.formatTime(note.createdAt)));

        const footer = App.el("div", "note-footer");
        const visibility = VISIBILITY[note.visibility] || { className: "visibility", label: note.visibility };
        footer.append(App.el("span", visibility.className, visibility.label));

        article.append(header, App.el("p", "note-content", note.content), footer);

        return article;
    }


    function showForm() {
        noteForm.reset();
        App.hide(noteError);
        App.show(newNoteSection);
        newNoteSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
        noteTitle.focus();
    }

    function hideForm() {
        noteForm.reset();
        App.hide(noteError);
        App.hide(newNoteSection);
    }


    async function submit(event) {

        event.preventDefault();

        const patientId = App.state.patientId;
        if (!patientId) {
            return;
        }

        const body = {
            title: noteTitle.value,
            content: noteText.value,
            visibility: noteVisibility.value
        };

        let data;

        try {
            const response = await fetch(`/api/patients/${patientId}/notes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            data = await response.json();
        } catch (error) {
            data = { success: false, message: "Kunde inte nå servern." };
        }

        if (!data.success) {
            noteError.textContent = data.message;
            App.show(noteError);
            return;
        }

        hideForm();

        // Noden skickar journal:updated till rummet, och då hämtas
        // journalen om. Utan anslutning hämtas den om direkt.
        if (!Socket.isJoined(patientId)) {
            Patients.open(patientId);
        }
    }


    newNoteButton.addEventListener("click", showForm);
    cancelNoteButton.addEventListener("click", hideForm);
    noteForm.addEventListener("submit", submit);


    window.Notes = { render, showForm, hideForm };

})();
