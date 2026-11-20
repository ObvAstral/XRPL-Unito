# XRPL Testnet

Richiede Node.js 22.13 o successivo. Dalla radice del repository:

```sh
npm --prefix xrpl ci
npm --prefix xrpl test
```

Il codice dell’escrow è in `escrow/`, con punto d’ingresso in `escrow/index.ts`. `shared/escrow-order.ts` definisce i termini che il verificatore dell’accordo deve fornire all’escrow. `fundBy` e `deliverBy` sono stringhe UTC ISO 8601 al secondo. L’importo è `"1000000"` drops. Il modulo calcola `FinishAfter` da `deliverBy` e aggiunge 300 secondi per `CancelAfter`.

| Chi lo usa | Funzione | Dati da fornire |
| --- | --- | --- |
| Oracolo | `prepareCondition()` | Salva la preimage nel proprio archivio e consegna all’API la sola condizione pubblica. |
| Firmatario di Bob | `EscrowService.fund(bundle, verify, wallet, confirm)` | `verify` verifica entrambe le firme e il regolamento, e legge dall’oracolo autenticato l’hash registrato. `confirm` mostra termini e fee e chiede conferma prima della firma. |
| API | `EscrowLedger.verifyEscrow(order, ledgerHash)` | Fornisce l’hash di `EscrowCreate` associato all’ordine appena disponibile. Usa lo stesso snapshot validato di `verifyPass`. |
| Oracolo | `EscrowService.finish(order, wallet, loadVerifiedDelivery, confirm)` | Il callback recupera il verdetto positivo persistito, verifica il PNG in custodia e restituisce la preimage associata a ordine, accordo e ID dell’oggetto escrow. |
| Firmatario di Bob | `EscrowService.recover(order, wallet, confirm)` | Fornisce l’accordo con l’hash del deposito. L’escrow deve risultare ancora aperto oltre il termine di annullamento. |

Usa `connectTestnet()` per aprire la connessione. In caso di failover, `connectTestnet('xrplLabs')` permette di ripetere l’intera verifica su uno snapshot nuovo. Chiudi la connessione con `client.disconnect()` alla fine. Ogni processo che firma usa un `AttemptStore` nella propria directory privata, per esempio sotto `xrpl/.xrpl-local/`. Mantieni lo stesso archivio quando riavvii il processo e chiudilo con `store.close()`.

Le operazioni restituiscono l’hash e lo stato del tentativo. Se è `pending`, interroga `reconcile(hash)`. Passa `true` come secondo argomento quando vuoi ritentare l’invio dello stesso blob. Conserva `createHash` sull’ordine dopo la validazione del deposito e applica il vincolo di unicità sull’ID dell’oggetto escrow nel database degli ordini. Per mostrare incasso o rimborso usa gli stati `paid` e `refunded` di `verifyEscrow`, ricavati dalla transazione validata che ha rimosso l’oggetto. [Invio affidabile su XRPL](https://xrpl.org/docs/concepts/transactions/reliable-transaction-submission)

Il modulo espone i punti di integrazione per la CLI, il verificatore delle firme, il database degli ordini e l’archivio dell’oracolo. I test locali usano un nodo simulato e wallet generati per le singole prove.

## Affitti v2 · Wallet, accordi e NFT

Compila con `npm --prefix xrpl run build`. La CLI si avvia con
`node xrpl/dist/agreement/rental-cli.js <comando>`. Nella tabella, `rental`
indica questo comando. Le risposte JSON escono su stdout e la richiesta di
conferma appare nel terminale. Per firmare, rileggi i termini e digita `SI`.

| Passo | Comandi |
| --- | --- |
| Preparare le identità | `rental wallet-create alice`, `rental wallet-create bob`, `rental wallet-create cad`, `rental wallet-create comune`. Recupera un indirizzo esistente con `rental wallet-address <ruolo>` e finanzia gli indirizzi di sviluppo con il [faucet Testnet](https://xrpl.org/resources/dev-tools/xrp-faucets). |
| Provare il login | `rental login-issue localhost:3000 <sessionRef> > challenge.json`, `rental login-sign localhost:3000 challenge.json bob > risposta.json`, `rental login-consume localhost:3000 <sessionRef> risposta.json`. Il comando finale restituisce l’indirizzo autenticato una sola volta. |
| Consegnare il titolo | `rental title-issue titolo.json cad > offerta-titolo.json`, `rental title-accept titolo.json offerta-titolo.json alice`. Usa l’ID validato nella risorsa del catalogo e nella proposta. |
| Firmare i termini | `rental proposal-sign proposta.json alice > proposta-firmata.json`, `rental order-sign proposta-firmata.json ordine.json bob > accettazione.json`. Copia `proposalHash` dall’output di Alice nell’ordine. In `accordo.json` usa i campi `proposal` e `proof` dell’output di Alice e inserisci l’intero output di Bob nel campo `acceptance`. |
| Verificare l’accordo | `rental rental-verify accordo.json risorsa.json`. L’esempio da 10 XRP e 1.000 punti base produce `feeDrops: "1000000"` e `netDrops: "9000000"`. |
| Approvare e consegnare il pass | `rental pass-issue accordo.json risorsa.json cad > offerta-pass.json`, `rental pass-accept accordo.json risorsa.json offerta-pass.json bob`. La ricevuta validata restituisce hash dell’accordo e della transazione, ledger, ID di pass e offerta e fee accreditata. |
| Controllare il ledger | `rental mint-offer-mode` legge lo stato dell’emendamento su un ledger validato. `rental pass-verify accordo.json risorsa.json <nftId> <ledgerHash>` restituisce `present`, `absent` o `unavailable`. |

I file `titolo.json`, `proposta.json` e `ordine.json` contengono ciascuno un
oggetto con i campi riportati qui sotto. Usa date future per l’affitto, in UTC
al secondo (ad esempio `2030-05-05T12:00:00Z`), con il termine del deposito
entro l’inizio del periodo.

| File | Campi |
| --- | --- |
| `titolo.json` | `resourceId`, `issuer`, `alice`, `validFrom`, `validTo` |
| `risorsa.json` | Tutti i campi del titolo, `titleNftId` e l’indirizzo `vault` fornito dalla Persona B |
| `proposta.json` | `protocol: "xrpl-unito:rental-proposal"`, `version: 2`, `network: "testnet"`, `splitRule: "floor-bps"`, `listingId`, `revision`, `resourceId`, `titleNftId`, `issuer`, `alice`, `startsAt`, `endsAt`, `priceDrops` (stringa), `feeBps` (intero) |
| `ordine.json` | `protocol: "xrpl-unito:rental-order"`, `version: 2`, `network: "testnet"`, `orderId`, `proposalHash`, `bob`, `vault`, `fundBy` |

I seed Testnet sono separati per ruolo, con permessi `0600`. La CLI li tiene
insieme ai registri locali in `~/.local/state/xrpl-unito-rental`. Puoi
scegliere una directory privata fuori dal repository con
`XRPL_RENTAL_STATE_DIR`. Se un invio restituisce `pending`, ripeti lo stesso
comando con gli stessi termini e lo stesso registro per riconciliare l’hash.
`XRPL_TESTNET_NODE` seleziona `ripple` (predefinito) o `xrpl-labs`.

### Integrazione con pagamenti e backend

- Il backend usa `WalletLogin.issue(sessionRef)` e
  `WalletLogin.consume(id, sessionRef, proof)` in [wallet-login.ts](agreement/wallet-login.ts).
  La sessione browser in attesa deve avere un riferimento opaco associato dal
  backend. Dopo il consumo, il backend apre la propria sessione per l’indirizzo
  restituito. Usa la configurazione del catalogo per verificare il titolo e il
  vault con `verifyRental` in [rental.ts](agreement/rental.ts).
- La Persona B può usare `LocalSigner.sign(tx)` e `LocalSigner.signPartial(tx)`
  di [wallet.ts](agreement/wallet.ts), oppure i comandi `tx-sign` e
  `tx-sign-partial`. Per la multifirma prepara una volta sola la transazione
  del vault con `SigningPubKey: ""`, fee per il numero di firme, sequenza e
  ledger limite. Ogni partecipante approva e firma lo stesso JSON. Riunisci
  i blob con `multisign` da `xrpl`.
- `verifyRentalTitle` e `verifyRentalPass` in [rental.ts](nft/rental.ts) usano
  l’hash di ledger fornito dal backend. Usa lo stesso hash per il deposito e
  applica intervallo, calendario e stato dell’ordine dal backend.
  `RentalNfts.revokePass` richiede la verifica del deposito sullo snapshot
  passato al callback. Restituisci `missing` solo dopo aver riconciliato gli
  invii e confermato l’assenza del deposito. Una revoca validata con
  `feeRefundDue: true` segnala un pass revocato dal wallet di Bob. Per il
  rimborso, la Persona B usa anche la ricevuta validata della fee pagata.
