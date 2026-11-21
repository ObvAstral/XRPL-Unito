# XRPL UniTo · Affitto temporaneo di diritti d’uso

Alice ha una licenza CAD annuale, ma ad agosto lascia libera la sua postazione. Sul marketplace può affittarla a Bob per quel mese e conservarne la titolarità. Alice sceglie periodo e prezzo, Bob accetta e il fornitore autorizza l’affitto. L’NFT che rappresenta la licenza resta nel wallet di Alice. Bob riceve un pass NFT separato, valido per usare la postazione nel periodo concordato.

Il prototipo usa **XRP Ledger (XRPL)** per registrare i titoli, i pass e i pagamenti in XRP. Il servizio che controlla la risorsa verifica il pass, il deposito e le date dell’ordine prima di concedere l’accesso. Alla scadenza Bob perde l’accesso anche se il pagamento ad Alice deve ancora essere liquidato.

## Casi d’uso

| Scenario | Chi autorizza | Cosa si vede nella demo |
| --- | --- | --- |
| **Licenza CAD** | Il fornitore del software | Durante l’affitto Bob può aprire il progetto dimostrativo e la postazione di Alice risulta occupata. Alla scadenza il portale chiude il progetto di Bob. Alice può riaprirlo se la sua licenza è ancora valida e la postazione è libera. |
| **Cartellone digitale** | Il Comune di Torino, simulato nella demo | Alice è la concessionaria dello schermo `torino-01`. Bob affitta una fascia oraria e può pubblicare un’immagine durante il periodo autorizzato. Lo schermo resta bianco fino alla pubblicazione e torna bianco alla scadenza. |

In entrambi i casi Alice firma l’annuncio e Bob firma l’ordine. Se l’ente approva, emette il pass. Bob lo accetta pagando la commissione e deposita il resto in **escrow**, un deposito vincolato fino alla fine dell’affitto. Nell’esempio da **10 XRP**, l’ente riceve **1 XRP** e **9 XRP** restano in escrow. A scadenza il deposito può essere sbloccato verso il *vault* della risorsa, un conto condiviso da Alice, Bob e l’ente. Nel flusso ordinario Alice e Bob firmano il pagamento dei 9 XRP ad Alice.

## Compilare e avviare il sito di test

Servono **Node.js 22.13.0 o successivo** e **npm**. Esegui i comandi dalla radice del repository.

```sh
npm --prefix xrpl ci
npm --prefix xrpl start
```

Lo script `start` compila i sorgenti TypeScript in `xrpl/dist/` e avvia il server in **simulazione locale**. Il sito prepara i wallet dimostrativi e salva lo stato in SQLite. Puoi provare entrambi i casi d’uso senza configurare un wallet o collegarti alla Testnet.

| Pagina | Indirizzo locale |
| --- | --- |
| Marketplace per scegliere un ruolo, pubblicare annunci e gestire ordini | [http://127.0.0.1:3000/](http://127.0.0.1:3000/) |
| Portale CAD per verificare l’accesso al progetto | [http://127.0.0.1:3000/cad](http://127.0.0.1:3000/cad) |
| Schermo pubblico del cartellone | [http://127.0.0.1:3000/schermo/torino-01](http://127.0.0.1:3000/schermo/torino-01) |

Per fermare il server premi `Ctrl+C`. Per compilare soltanto, esegui `npm --prefix xrpl run build`. Per compilare ed eseguire i test automatici, usa `npm --prefix xrpl test`.

### Prima prova di un affitto in scadenza

1. Apri il marketplace e scegli **Bob**. In **Simulation controls** seleziona lo scenario CAD **Active rental** e premi **Load scenario**. Il caricamento sostituisce annunci, ordini e immagini della simulazione corrente.
2. Apri il portale CAD in una seconda scheda dello stesso browser e premi **Open demo project**. Il progetto si apre perché Bob ha già ricevuto il pass e finanziato l’ordine.
3. Lascia aperto il progetto. Nel marketplace premi **Jump to rental end** nei controlli della simulazione. Torna alla scheda CAD per vedere il progetto chiudersi e verifica che Alice possa accedere di nuovo.

Per provare il cartellone, scegli **Advertising Billboard** nel marketplace. Pubblica un annuncio come **Alice**, accettalo come **Bob** e approvalo come **Municipality of Turin**. Torna a Bob, accetta il pass e deposita il saldo. All’inizio dell’affitto, **Use a sample image** permette di pubblicare subito un’immagine e vederla sullo schermo `torino-01`.

### Avvio facoltativo su XRPL Testnet

Per provare le transazioni sulla rete di test pubblica serve una connessione alla Testnet e al suo faucet. Dopo aver installato le dipendenze, ferma l’eventuale server locale ed esegui i comandi dalla radice.

```sh
npm --prefix xrpl run setup:wallets
XRPL_MODE=testnet npm --prefix xrpl start
```

Il primo comando prepara i wallet di sviluppo e i due vault con firma multipla **2 su 3**, uno per il CAD e uno per il cartellone. Il secondo serve le stesse tre pagine usando la Testnet. Le chiavi di sviluppo e i dati locali sono conservati in `xrpl/.xrpl-local/`, esclusa da Git.
