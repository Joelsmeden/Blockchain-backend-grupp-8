// Sök patient och öppna journal. Servern avgör vem som får se vad:
// en öppning loggas som READ, ett nekat försök ger 403 och loggas som
// DENIED hos den patient försöket gällde.

(() => {

    const searchInput = document.getElementById("patient-search");
    const searchButton = document.querySelector(".search-container button");
    const searchResults = document.getElementById("search-results");
    const patientName = document.getElementById("patient-name");
    const patientPersonnummer = document.getElementById("patient-personnummer");
    const patientAvatar = document.querySelector(".patient-avatar");
    const birthDate = document.querySelector(".patient-details .detail strong");

    let searchTimer = null;


    function focus() {
        searchInput.focus();
    }


    async function search(query) {

        const term = (query || "").trim();

        if (!term) {
            searchResults.replaceChildren();
            App.hide(searchResults);
            return;
        }

        try {
            const response = await fetch("/api/patients?q=" + encodeURIComponent(term));
            const data = await response.json();
            renderResults(data.success ? data.patients : [], data.message);
        } catch (error) {
            renderResults([], "Kunde inte nå servern.");
        }
    }


    function renderResults(patients, message) {

        searchResults.replaceChildren();

        if (!patients.length) {
            searchResults.append(App.el("p", "subtitle", message || "Inga patienter hittades."));
            App.show(searchResults);
            return;
        }

        patients.forEach(patient => {

            const button = App.el(
                "button",
                "btn btn-secondary",
                `${patient.firstName} ${patient.lastName} · ${patient.personalNumber}`
            );
            button.type = "button";
            button.addEventListener("click", () => {
                App.hide(searchResults);
                open(patient.id);
            });

            const row = App.el("div", "form-group");
            row.append(button);
            searchResults.append(row);
        });

        App.show(searchResults);
    }


    function renderPatient(patient) {
        const name = `${patient.firstName} ${patient.lastName}`;
        patientName.textContent = name;
        patientPersonnummer.textContent = `Personnummer: ${patient.personalNumber}`;
        patientAvatar.textContent = name
            .split(/\s+/)
            .map(word => word[0].toUpperCase())
            .join("");
        if (birthDate) {
            birthDate.textContent = patient.dateOfBirth;
        }
    }


    // Hämtar journalen och visar anteckningar och åtkomstlogg. Anropas
    // också när noden meddelar journal:updated.
    async function open(id) {

        let response;
        let data;

        try {
            response = await fetch("/api/patients/" + id);
            data = await response.json();
        } catch (error) {
            renderResults([], "Kunde inte nå servern.");
            return;
        }

        if (response.status === 403) {
            App.state.patientId = null;
            App.showDenied();
            return;
        }

        if (!data.success) {
            renderResults([], data.message);
            return;
        }

        App.state.patientId = data.patient.id;
        renderPatient(data.patient);
        Notes.render(data.notes);
        AccessLogs.render(data.accessLog);
        App.showPatient();
        Socket.join(data.patient.id);
    }


    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => search(searchInput.value), 250);
    });

    searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            clearTimeout(searchTimer);
            search(searchInput.value);
        }
    });

    searchButton.addEventListener("click", () => {
        clearTimeout(searchTimer);
        search(searchInput.value);
    });


    window.Patients = { focus, search, open };

})();
