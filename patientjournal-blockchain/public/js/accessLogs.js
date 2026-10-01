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