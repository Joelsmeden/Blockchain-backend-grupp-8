# Grupp 8 - Vårdens bästa vän

Grupparbete i kursen Blockkedja backend, Node.js och blockkedja, i utbildningen Blockchainutvecklare på Medieinstitutet, hösten 2026.

Detta är ett projekt som inte är bara för att uppfylla ett syfte, men också för att ge privatpersoner snabb och säker åtkomst till sin medecinska information.

De som har behörighet ska också lätt kunna komma åt information som är delad av patienter.
## Installation

Kräver Node 20 eller senare.

```bash
  git clone https://github.com/Joelsmeden/Blockchain-backend-grupp-8.git
  cd Blockchain-backend-grupp-8/patientjournal-blockchain
  npm install
```
    
## Deployment

### To deploy this project run

Terminal 1 (Server 1 - ex. Sjukhus S):
```bash
  npm run node1
```
Terminal 2 (Server 2 - ex. Ambulans A):
```bash
  npm run node2
```
Nod 1 svarar på http://localhost:3001 och nod 2 på http://localhost:3002. Alla demokonton har lösenordet 1234. Konton, API, databas, skärmdumpar och tester beskrivs i [patientjournal-blockchain/README.md](patientjournal-blockchain/README.md).

Från mappen patientjournal-blockchain
```bash
  npm test
```
## Authors

- [@Joel](https://github.com/Joelsmeden)
- [@Khalil](https://github.com/Kalleanka123456)
- [@Khosro](https://github.com/KOMPAI-DEV)

