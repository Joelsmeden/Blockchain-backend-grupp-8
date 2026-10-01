async function fetchNodeStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();

    if (data.success) {
      console.log('Status hämtad:', data);

      const nodeNameEl = document.getElementById('node-name');
      const chainLengthEl = document.getElementById('chain-length');

      if (nodeNameEl) nodeNameEl.textContent = data.node;
      if (chainLengthEl) chainLengthEl.textContent = data.chainLength;
    }
  } catch (error) {
    console.error('Kunde inte hämta nodstatus:', error);
  }
}

fetchNodeStatus();

// Åtkomstloggen för den öppnade journalen: vem, vad, när, och om raden
// stämmer mot kedjan. Nya poster läggs överst i realtid via
// access:logged utan att något hämtas om.

(() => {

    const accessLogList = document.getElementById("access-log-list");
    const chainStatus = document.querySelector(".blockchain-status");

    let statusTimer = null;

    const ACTIONS = {
        READ: { icon: "👤", label: "Läste journalen" },
        WRITE: { icon: "✎", label: "Skrev en anteckning" },
        DENIED: { icon: "⚠", label: "Nekades åtkomst" }
    };


    function render(entries) {

        accessLogList.replaceChildren();

        if (!entries.length) {
            accessLogList.append(App.el("p", "subtitle", "Ingen registrerad åtkomst än."));
        }

        entries.forEach(entry => accessLogList.append(renderEntry(entry)));
        refreshChainStatus();
    }


    // Posten från realtidshändelsen. Finns samma post redan, till exempel
    // från en omhämtning som hann före, byts raden ut mot den här.
    function prepend(entry) {

        const row = renderEntry(entry);
        const existing = accessLogList.querySelector(`[data-id="${entry.id}"]`);

        if (existing) {
            existing.replaceWith(row);
        } else {
            const empty = accessLogList.querySelector(".subtitle");
            if (empty) {
                empty.remove();
            }
            accessLogList.prepend(row);
        }

        refreshChainStatus();
    }


    // Kontrollerar kedjan direkt och en gång till efter en stund, så att
    // märket hinner bli grönt när den andra noden tagit emot blocket.
    function refreshChainStatus() {
        updateChainStatus();
        clearTimeout(statusTimer);
        statusTimer = setTimeout(updateChainStatus, 1500);
    }


    function renderEntry(entry) {

        const row = App.el("div", "access-log");
        row.dataset.id = entry.id;

        const action = ACTIONS[entry.action] || { icon: "•", label: entry.action };

        const content = App.el("div", "log-content");
        content.append(
            App.el("strong", null, entry.userName || `Användare ${entry.userId}`),
            App.el("span", null, `${action.label} (${entry.role})`),
            App.el("small", null, App.formatTime(entry.timestamp))
        );

        row.append(
            App.el("div", "log-icon", action.icon),
            content,
            entry.entryHash
                ? App.el("span", "verified", "Verifierad")
                : App.el("span", "error-message", "Ej verifierad")
        );

        return row;
    }


    // Kontrollen av alla loggrader mot kedjan, visas i rubriken
    async function updateChainStatus() {

        if (!chainStatus) {
            return;
        }

        try {
            const response = await fetch("/api/chain/verify");
            const data = await response.json();
            const issues = (data.tamperedRows || []).length + (data.missingRows || []).length;
            chainStatus.textContent = data.valid
                ? "● Blockchain verifierad"
                : `● Blockchain: ${issues} avvikelser`;
        } catch (error) {
            chainStatus.textContent = "● Blockchain";
        }
    }


    window.AccessLogs = { render, prepend, updateChainStatus };

})();
