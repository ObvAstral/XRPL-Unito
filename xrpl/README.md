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
