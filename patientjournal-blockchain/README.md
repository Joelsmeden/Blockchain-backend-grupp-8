# Patientjournal med blockkedja

Teknisk dokumentation för backend. Projektets översikt finns i [README i repots rot](../README.md), arkitekturen beskrivs i [docs/arkitektur.md](docs/arkitektur.md).

Systemet är ett journalsystem där patientdata ligger i en SQL-databas, medan varje åtkomst till en journal registreras i en blockkedja som synkas mellan två servrar över WebSockets. Den som öppnar en journal, skriver en anteckning eller nekas åtkomst lämnar ett spår som inte kan ändras eller raderas i efterhand utan att det upptäcks. Journaltexten finns aldrig i kedjan, bara id-nummer, tidpunkt och en hash.

## Kom igång

Kräver Node 20 eller senare och npm.

```bash
cd patientjournal-blockchain
npm install
```

### Starta två noder

Samma fil, `src/server.js`, startas två gånger med olika miljövariabler. Öppna två terminaler:

```bash
npm run node1     # HTTP på port 3001, P2P på port 6001
npm run node2     # HTTP på port 3002, P2P på port 6002, ansluter till nod 1
```

Scripten använder `cross-env`, så de fungerar även i Windows. Första gången databasen är tom läggs demodata in automatiskt. Gränssnittet nås på <http://localhost:3001> och <http://localhost:3002>, API:et under `/api`.

Startordningen spelar ingen roll. Nod 2 försöker nå nod 1 var tredje sekund tills den svarar, och noderna kan startas samtidigt.

### Miljövariabler

| Variabel | Standard | Betydelse |
|---|---|---|
| `PORT` | `3000` | HTTP-port för API, frontend och socket.io |
| `P2P_PORT` | `6000` | WebSocket-port som andra noder ansluter till |
| `PEERS` | tom | Kommaseparerade adresser till andra noder, till exempel `ws://localhost:6001` |
| `NODE_NAME` | `nod-<PORT>` | Namn i loggar och i `/api/status` |
| `DIFFICULTY` | `2` | Antal inledande nollor som krävs i en blockhash. Måste vara samma på alla noder. |
| `DB_PATH` | `data/patientjournal.db` | Databasfilen. Båda noderna delar samma fil. |
| `CHAIN_DIR` | `data/` | Katalog för nodernas sparade kedjor, `chain-<P2P_PORT>.json` |
| `SESSION_SECRET` | ett utvecklingsvärde | Hemlighet för sessionscookien. Byt i produktion. |

### Övriga kommandon

```bash
npm test          # hela testsviten
npm run seed      # lägg in demodata manuellt, gör inget om databasen redan har data
npm start         # en nod med standardvärden
```

Vill du börja om från tomt: stoppa noderna och ta bort katalogen `data/`. Nästa start skapar databasen igen, seedar den och tar bort gamla kedjefiler.

## Demokonton

Alla konton har lösenordet `1234`.

| Användarnamn | Namn | Roll | Journal |
|---|---|---|---|
| `doctor` | Anna Andersson | läkare | |
| `nurse` | Erik Svensson | sjuksköterska | |
| `clinic` | Vårdcentral A | vårdcentral | |
| `patient` | Lisa Karlsson | patient | patient 1 |
| `unauthorized` | Obehörig användare | obehörig | |
| `patient2` | Johan Nilsson | patient | patient 2 |

Demodatan har tre patienter, Lisa Karlsson (1), Johan Nilsson (2) och Maria Lindqvist (3), med anteckningar i alla tre synlighetsnivåerna.

Inloggningen läser just nu kontona från `src/models/userModel.js`. Kontot `patient2` finns bara i databasen och kan användas när inloggningen pekas om till `authService.authenticateUser`, se [Kända begränsningar](#kända-begränsningar).

## Skärmdumpar

Skärmdumpar av inloggning, sökning, journalvy per roll och åtkomstloggen i realtid läggs till här.

## Roller och behörighet

| Roll | Söka | Läsa journal | Ser anteckningar | Skriva | Ser logg |
|---|---|---|---|---|---|
| läkare | ja | alla patienter | egna, staff, all | ja | ja |
| sjuksköterska | ja | alla patienter | egna, staff, all | ja | ja |
| vårdcentral | ja | alla patienter | all | nej | ja |
| patient | nej | bara sin egen | all | nej | ja |
| obehörig | nej | nej | nej | nej | nej |

Reglerna ligger samlade i `src/services/accessControl.js` och används av API:et och av socket.io. Kontrollen görs alltid på servern. En patient som byter id i URL:en får 403, och försöket loggas som `DENIED` i den andra patientens åtkomstlogg.

**Vårdcentralen** har ingen given roll i uppgiften. Vi har tolkat den som en tillsynsroll: den behöver kunna hitta och läsa alla journaler och se vem som varit inne i dem, men den vårdar inte patienten själv. Därför får den varken skriva anteckningar eller se anteckningar som är markerade för personal (`staff`), bara de som är öppna för alla (`all`).

**Anteckningars synlighet**

| Synlighet | Vem ser den |
|---|---|
| `private` | bara författaren |
| `staff` | läkare och sjuksköterskor |
| `all` | alla som får läsa journalen, även patienten |

Egna anteckningar syns alltid för den som skrivit dem, oavsett synlighet. Det löses i SQL-frågan: `WHERE patient_id = ? AND (visibility IN (...) OR author_id = ?)`.

## API

Alla svar är JSON på formen `{ success: true|false, message: "...", ...data }`. Inloggningen använder en sessionscookie, `patientjournal.sid.<PORT>`, som sätts vid `POST /api/login`. Cookienamnet innehåller porten så att man kan vara inloggad på båda noderna samtidigt i samma webbläsare.

| Metod och väg | Kräver | Gör |
|---|---|---|
| `POST /api/login` | | Loggar in, sätter sessionscookie |
| `POST /api/logout` | | Avslutar sessionen |
| `GET /api/me` | | Inloggad användare |
| `GET /api/patients?q=` | inloggad, läkare / sjuksköterska / vårdcentral | Söker på namn eller personnummer. Tom söksträng ger alla. |
| `GET /api/patients/:id` | inloggad | Journal med anteckningar och åtkomstlogg. Loggas som `READ`. |
| `POST /api/patients/:id/notes` | inloggad, läkare / sjuksköterska | Ny anteckning. Loggas som `WRITE`. |
| `GET /api/chain` | | Hela kedjan |
| `GET /api/chain/verify` | | Kontroll av alla loggrader mot kedjan |
| `GET /api/status` | | Nodens namn, antal anslutna noder, kedjelängd |

**Statuskoder**

| Kod | När |
|---|---|
| `200` / `201` | OK, `201` vid ny anteckning |
| `400` | Fält saknas eller är ogiltiga, eller ogiltig JSON |
| `401` | Inte inloggad: `Du måste vara inloggad.` |
| `403` | Inloggad men saknar behörighet: `Åtkomst nekad.` Gäller det en patients journal loggas försöket som `DENIED` mot den patienten. |
| `404` | Patienten finns inte: `Patienten finns inte.` Inget loggas. |

### Exempel

Logga in:

```http
POST /api/login
Content-Type: application/json

{ "username": "doctor", "password": "1234" }
```

```json
{
  "success": true,
  "message": "Inloggning lyckades.",
  "user": { "id": 1, "username": "doctor", "name": "Anna Andersson", "role": "läkare", "patientId": null }
}
```

Öppna en journal:

```http
GET /api/patients/2
```

```json
{
  "success": true,
  "patient": { "id": 2, "personalNumber": "19720930-1157", "firstName": "Johan", "lastName": "Nilsson", "dateOfBirth": "1972-09-30" },
  "notes": [
    { "id": 4, "patientId": 2, "authorId": 1, "authorName": "Anna Andersson", "authorRole": "läkare",
      "title": "Diabeteskontroll", "content": "HbA1c 52 mmol/mol ...", "visibility": "all", "createdAt": "2026-10-01T09:12:44.118Z" }
  ],
  "accessLog": [
    { "id": 7, "patientId": 2, "userId": 1, "userName": "Anna Andersson", "role": "läkare", "action": "READ",
      "noteId": null, "timestamp": "2026-10-01T10:31:02.417Z", "entryHash": "3f9c…", "blockHash": "00a1…" },
    { "id": 6, "patientId": 2, "userId": 4, "userName": "Lisa Karlsson", "role": "patient", "action": "DENIED",
      "noteId": null, "timestamp": "2026-10-01T10:30:51.902Z", "entryHash": "b72e…", "blockHash": "0040…" }
  ]
}
```

Åtkomstloggen visas med senaste posten först. Den egna läsningen loggas innan loggen hämtas, så den syns överst.

Skriv en anteckning:

```http
POST /api/patients/2/notes
Content-Type: application/json

{ "title": "Uppföljning", "content": "Patienten mår bättre.", "visibility": "staff" }
```

`visibility` är `private`, `staff` eller `all`. Utelämnas den blir det `staff`.

Verifiera liggaren:

```http
GET /api/chain/verify
```

```json
{
  "success": true,
  "message": "Liggaren stämmer med kedjan.",
  "valid": true,
  "chainValid": true,
  "rowCount": 12,
  "entryCount": 12,
  "tamperedRows": [],
  "missingRows": []
}
```

`tamperedRows` är id på loggrader vars innehåll inte längre stämmer med kedjan. `missingRows` är id på poster som finns i kedjan men saknas i databasen, det vill säga raderade rader.

Nodstatus:

```json
{
  "success": true,
  "node": "nod-3001",
  "port": 3001,
  "p2pPort": 6001,
  "peers": 1,
  "chainLength": 13,
  "latestHash": "00c4e1…",
  "difficulty": 2
}
```

## Realtid

Varje nod kör socket.io på samma port som HTTP. Klienten ansluter med samma sessionscookie som API:et, och anslutningen avvisas med `Du måste vara inloggad.` om sessionen saknas.

**Klient till server**

| Händelse | Argument | Svar |
|---|---|---|
| `patient:join` | `patientId`, callback | `{ success, message, patientId }`. Nekas om användaren inte får se patienten, samma regel som för `GET /api/patients/:id`. En klient lyssnar på en patient i taget. |
| `patient:leave` | `patientId`, callback | `{ success, message }` |

**Server till klient**, till alla som lyssnar på patienten, oavsett vilken nod händelsen skedde på:

| Händelse | När | Innehåll | Klienten bör |
|---|---|---|---|
| `access:logged` | `READ` eller `DENIED` | Loggposten, samma format som i `accessLog` | Lägga till posten överst i listan, utan att hämta något |
| `journal:updated` | `WRITE` | `{ patientId, noteId, entry }` | Hämta om journalen med `GET /api/patients/:id` |

Två skilda händelser är nödvändigt. Varje hämtning av journalen loggas som en läsning. Om klienten hämtade om journalen varje gång loggen växte skulle hämtningen skapa en ny loggpost, som fick klienten att hämta igen, i all oändlighet.

## Databas

SQLite via `better-sqlite3`. Båda noderna öppnar samma fil i WAL-läge, som tillåter samtidiga läsningar och skrivningar från två processer. Schemat i `src/database/schema.sql` körs vid varje start och skapar tabellerna om de saknas.

```
patients                      users
  id            INTEGER PK      id             INTEGER PK
  personal_number TEXT UNIQUE   username       TEXT UNIQUE
  first_name    TEXT            password_hash  TEXT        scrypt
  last_name     TEXT            password_salt  TEXT        16 slumpade byte per användare
  date_of_birth TEXT            name           TEXT
  created_at    TEXT            role           TEXT  CHECK: läkare, sjuksköterska, vårdcentral, patient, obehörig
                                patient_id     INTEGER UNIQUE → patients.id   kopplar patientkonto till journal
                                created_at     TEXT
                                CHECK: role <> 'patient' OR patient_id IS NOT NULL

notes                         access_logs
  id          INTEGER PK        id          INTEGER PK
  patient_id  → patients.id     patient_id  → patients.id
  author_id   → users.id        user_id     → users.id
  title       TEXT              role        TEXT  CHECK som users.role
  content     TEXT              action      TEXT  CHECK: READ, WRITE, DENIED
  visibility  TEXT  CHECK:      note_id     → notes.id   vid WRITE
              private, staff,   timestamp   TEXT  ISO 8601
              all               entry_hash  TEXT  sha256 av raden
  created_at  TEXT              block_hash  TEXT  blocket som innehåller posten
```

Främmande nycklar är påslagna. Raderna i `access_logs` har inga `ON DELETE`-regler, så en loggrad kan inte försvinna i det tysta för att en patient eller anteckning tas bort.

Lösenord hashas med `crypto.scryptSync` och ett eget salt per användare. Jämförelsen görs med `crypto.timingSafeEqual`.

## Åtkomstliggaren och kedjan

Liggaren finns på två ställen med olika syften.

**Raden i databasen** är den som visas för användarna. Den har namn, roll och tidpunkt och går att söka och sortera.

**Blocket i kedjan** innehåller samma post, men bara med id-nummer, plus en hash av raden. Kedjan replikeras mellan noderna och är det som gör raden kontrollerbar.

### Vad som händer vid en åtkomst

1. Raden skrivs i `access_logs` och får ett `id`.
2. `entry_hash` beräknas som sha256 av exakt sju fält, kanoniskt serialiserade (nycklarna i alfabetisk ordning): `id`, `patientId`, `userId`, `role`, `action`, `noteId`, `timestamp`.
3. Ett eget block minas för posten, med dessa sju fält och `entryHash` som data.
4. `entry_hash` och `block_hash` skrivs tillbaka på raden.
5. Blocket skickas till övriga noder över P2P och till webbläsarna över socket.io.

Ett block i `GET /api/chain` ser ut så här:

```json
{
  "index": 6,
  "timestamp": "2026-10-01T10:30:51.955Z",
  "data": {
    "id": 6, "patientId": 2, "userId": 4, "role": "patient", "action": "DENIED",
    "noteId": null, "timestamp": "2026-10-01T10:30:51.902Z",
    "entryHash": "b72e5c…"
  },
  "previousHash": "00e551…",
  "nonce": 143,
  "hash": "0040d7…"
}
```

Det finns ingen journaltext, inget namn och inget personnummer i kedjan. Blockets hash beräknas över `index | previousHash | timestamp | data | nonce`, där `data` serialiseras kanoniskt. Därför ger samma data alltid samma hash på alla noder, oavsett i vilken ordning fälten råkade skapas, och ett block som kommit som JSON från en annan nod kan räknas om och kontrolleras.

Proof of work: `nonce` ökas tills hashen börjar med `DIFFICULTY` antal nollor. Standardvärdet 2 tar ett par millisekunder per block, 3 cirka 30 ms och 4 cirka 400 ms. I test tvingas värdet till 1.

### Verifiering

`GET /api/chain/verify` gör två kontroller.

- **Ändrade rader.** För varje rad räknas hashen om från de sju fälten och slås upp i kedjan. Finns den inte, eller stämmer den inte med radens sparade `entry_hash`, har raden ändrats. Det gäller även om någon ändrat `entry_hash` i databasen för att dölja ändringen, eftersom kedjan har originalet.
- **Raderade rader.** Hasharna avslöjar inte en rad som tagits bort helt, för då stämmer fortfarande alla rader som finns kvar. Därför jämförs också kedjans poster mot databasens rader, id för id, och antalet. En post som finns i kedjan men saknar rad i databasen hamnar i `missingRows`.

Kedjan kontrolleras också i sig själv: varje block ska peka på föregående blocks hash, ha korrekt omräknad hash och uppfylla svårighetsgraden, och genesis-blocket ska vara det förväntade.

### Kedjan överlever omstart

Kedjan ligger i minnet. Varje nod sparar därför sin kedja i `data/chain-<P2P_PORT>.json` efter varje nytt block och läser in den vid start, om filen finns och kedjan är giltig. Utan det skulle en omstartad nod ha bara genesis kvar medan databasen har alla rader, och verifieringen skulle underkänna allt. Om databasen seedas från tomt tas gamla kedjefiler bort, eftersom de då skulle peka på rader som inte finns.

## P2P mellan noderna

`src/p2p/p2pServer.js` använder `ws`. Varje nod lyssnar på `P2P_PORT` och ansluter själv till adresserna i `PEERS`. Bryts en anslutning, eller går den inte att öppna, görs ett nytt försök var tredje sekund.

| Meddelande | Betydelse |
|---|---|
| `QUERY_LATEST` | Be om motpartens senaste block. Skickas direkt när en anslutning öppnas. |
| `QUERY_ALL` | Be om hela kedjan |
| `RESPONSE_BLOCKCHAIN` | Svar med ett eller flera block |
| `BROADCAST_BLOCK` | Ett nytt block som just lagts till |

När ett block tas emot:

- Index lägre än eller lika med vårt senaste: ignorera, vi har det redan.
- Pekar på vårt senaste: lägg till, och skicka vidare till övriga noder **bara om det faktiskt lades till**. Annars skulle samma block studsa runt mellan noderna.
- Ett ensamt block som inte passar: vi ligger mer än ett block efter, eller har en fork. Be om hela kedjan.
- En hel kedja: byt till den bara om den är **längre och giltig**.

### Forkhantering

Varje åtkomst blir ett block direkt, så två noder kan hinna skapa block med samma index samtidigt. Längsta kedjan vinner, men då skulle posten i den kedja som förlorade försvinna. Därför jämförs kedjans poster före och efter bytet, och de egna poster som saknas minas om ovanpå den nya kedjan. Raden i databasen får det nya blockets hash. Ingen åtkomst tappas, den byter bara plats i kedjan.

## Prova själv

Starta båda noderna och kör följande i en tredje terminal. Exemplen använder `curl` med cookie-filer, men samma anrop går att göra från vilket verktyg som helst.

```bash
# Läkaren loggar in på nod 1 och öppnar Johans journal (patient 2)
curl -s -c doc.txt -H 'Content-Type: application/json' \
     -d '{"username":"doctor","password":"1234"}' http://localhost:3001/api/login
curl -s -b doc.txt http://localhost:3001/api/patients/2

# Lisa (patient 1) loggar in på nod 1 och försöker öppna Johans journal: 403
curl -s -c lisa.txt -H 'Content-Type: application/json' \
     -d '{"username":"patient","password":"1234"}' http://localhost:3001/api/login
curl -s -b lisa.txt -w '\nHTTP %{http_code}\n' http://localhost:3001/api/patients/2

# Kedjan är densamma på båda noderna: samma längd och samma sista hash
curl -s http://localhost:3001/api/status
curl -s http://localhost:3002/api/status

# Läkaren öppnar Johans journal på NOD 2 och ser Lisas nekade försök från nod 1
curl -s -c doc2.txt -H 'Content-Type: application/json' \
     -d '{"username":"doctor","password":"1234"}' http://localhost:3002/api/login
curl -s -b doc2.txt http://localhost:3002/api/patients/2

# Verifiering, grön på båda
curl -s http://localhost:3001/api/chain/verify
curl -s http://localhost:3002/api/chain/verify
```

Manipulera sedan databasen direkt, som om någon försökte sopa igen spåren, och verifiera igen:

```bash
# Ändra det nekade försöket till en vanlig läsning
node -e "require('better-sqlite3')('data/patientjournal.db')
  .prepare(\"UPDATE access_logs SET action = 'READ' WHERE action = 'DENIED'\").run()"
curl -s http://localhost:3001/api/chain/verify      # valid: false, tamperedRows: [...]

# Radera raden helt
node -e "require('better-sqlite3')('data/patientjournal.db')
  .prepare('DELETE FROM access_logs WHERE id = (SELECT MAX(id) FROM access_logs)').run()"
curl -s http://localhost:3001/api/chain/verify      # valid: false, missingRows: [...]
```

Öppnar du journalen i webbläsaren på nod 2 samtidigt som Lisa nekas på nod 1 dyker den nekade posten upp i loggen direkt, utan omladdning.

## Tester

```bash
npm test
```

Sviten har 287 tester i 17 filer och tar några sekunder. Testerna kör mot en databas i minnet, med svårighetsgrad 1 och utan kedjefil, och varje testfil får egna moduler så att de inte påverkar varandra eller den riktiga databasen.

| Katalog | Vad som testas |
|---|---|
| `tests/blockchain/` | Hashning och kanonisk serialisering, block, proof of work, kedjans validering, byte av kedja, kedjefilen |
| `tests/services/` | Liggaren: hashning av exakt sju fält, blockens innehåll, ändrade och raderade rader, manipulerad kedja, block utifrån, fork med omminering. Inloggning mot databasen. |
| `tests/middleware/` | Inloggnings- och rollkontroll, behörighetsreglerna för varje roll mot varje kolumn i tabellen |
| `tests/api/` | Alla routes med supertest: inloggning, sökning per roll, journal och anteckningar per roll, 403 med `DENIED` mot rätt patient, 404 utan loggning, kedjan utan journaltext, verifiering, status |
| `tests/p2p/` | Riktiga noder i samma process: anslutning och återanslutning, spridning av block åt båda hållen och via mellanliggande nod, sen ansluten nod, fork, felaktiga meddelanden. Socket.io: handshake med och utan session, rum per roll, varje händelsetyp. |

## Projektstruktur

```
patientjournal-blockchain/
├── src/
│   ├── app.js                    Express-appen: session, JSON, routes, static
│   ├── server.js                 Läser miljön, seedar, startar HTTP, P2P och socket.io
│   ├── config/
│   │   ├── database.js           Öppnar databasen i WAL-läge och kör schemat
│   │   └── role.js               Rollnamnen
│   ├── database/
│   │   ├── schema.sql
│   │   └── seed.js               Demodata med hashade lösenord
│   ├── blockchain/
│   │   ├── crypto.js             sha256 och kanonisk serialisering
│   │   ├── Block.js              Blockets fält och statisk hashberäkning
│   │   ├── proofOfWork.js        Mining och svårighetsgrad
│   │   ├── Blockchain.js         Genesis, validering, appendBlock, replaceChain
│   │   └── chainStore.js         Sparar och läser nodens kedja på disk
│   ├── middleware/               Inloggnings- och rollkontroll
│   ├── routes/                   En fil per resurs, monteras i app.js
│   ├── controllers/              HTTP in och ut, loggar READ, WRITE och DENIED
│   ├── services/
│   │   ├── accessControl.js      Behörighetsreglerna
│   │   ├── accessLogService.js   Liggaren: rad, hash, block, verifiering, fork
│   │   ├── authService.js        Lösenordshashning och inloggning mot databasen
│   │   ├── noteService.js
│   │   └── patientService.js
│   ├── models/                   SQL mot respektive tabell
│   └── p2p/
│       ├── p2pServer.js          WebSocket mellan noderna
│       └── socketHandler.js      socket.io till webbläsarna
├── public/                       Frontend, serveras som statiska filer
├── tests/
├── docs/arkitektur.md
└── data/                         Skapas vid start: databas och kedjefiler, inte i git
```

Flödet är routes → controllers → services → models. Kedjan ägs av `accessLogService`, som skickar händelsen `block` när ett block lagts till, lokalt eller från en annan nod. P2P och socket.io lyssnar på den händelsen, så liggaren känner inte till nätverket.

## Kända begränsningar

- **Inloggningen läser från `userModel.js`.** `authService.authenticateUser` gör samma sak mot databasen och returnerar samma objekt, så bytet är en `require`-rad i `authController.js`. Tills dess fungerar inte kontot `patient2`.
- **Båda noderna måste nå samma databasfil.** Kedjan replikeras mellan noderna, men databasen delas. Noderna ska därför köras på samma maskin, eller mot en gemensam fil.
- **Sessioner ligger i minnet** per nod. Startas en nod om loggas användarna ut från den noden.
- **Omminering kan ge dubbletter med tre eller fler noder**, om flera noder förlorat samma post i en fork och alla minar om den. Med två noder kan det inte hända, eftersom en post bara finns på noden som skapade den tills den spridits.
- **`DIFFICULTY` måste vara samma på alla noder.** En nod med högre krav underkänner den andras block.

## Författare

Khosro Sharifi, GitHub KOMPAI-DEV.
