# Grupp 8 - Vårdens bästa vän

Detta är ett projekt som inte är bara för att uppfylla ett syfte, men också för att ge privatpersoner snabb och säker åtkomst till sin medecinska information.

De som har behörighet ska också lätt kunna komma åt information som är delad av patienter.
## Installation

Install my-project with npm

```bash
  npm install my-project
  cd my-project
```
    
## Deployment

### To deploy this project run

Terminal 1 (Server 1 - ex. Sjukhus S):
```bash
  PORT=3001 PEERS=ws://localhost:6002 P2P_PORT=6001 npm run dev
```
Terminal 2 (Server 2 - ex. Ambulans A):
```bash
  PORT=3001 PEERS=ws://localhost:6002 P2P_PORT=6001 npm run dev
```
Från rot mappen
```bash
  npm test
```
## Authors

- [@Joel](https://github.com/Joelsmeden)
- [@Khalil](https://github.com/Kalleanka123456)

