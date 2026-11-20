# Modulo Pagamenti, Escrow e Vault 2-su-3 · XRPL Testnet (v2)

Richiede Node.js `>= 22.13.0`. Dalla radice del repository:

```sh
npm --prefix xrpl ci
npm --prefix xrpl test
```

## 1. Setup preliminare dei due Vault e verifica Testnet (`setup-wallets.ts`)

Per creare (o verificare e riprendere al riavvio) i wallet di sviluppo, i due vault 2-su-3 prefinanziati su XRPL Testnet e controllare se l’emendamento `NFTokenMintOffer` è attivo:

```sh
npm --prefix xrpl run setup:wallets
```

- Salva le chiavi private di sviluppo in `xrpl/.xrpl-local/dev-secrets.json` (`0600`, escluso da git).
- Salva e stampa su `stdout` `xrpl/.xrpl-local/public-config.json` da consegnare a **Persona A** e **Persona C**:
  - `participants`: indirizzi classici di `alice`, `bob`, `cadAuthority`, `billboardAuthority` e `operator`.
  - `vaults.cad`: indirizzo del vault CAD con `SignerQuorum: 2`, firmatari `[alice, bob, cadAuthority]` (`SignerWeight: 1`) e `masterDisabled: true` (`asfDisableMaster`).
  - `vaults.billboard`: indirizzo del vault Cartellone con `SignerQuorum: 2`, firmatari `[alice, bob, billboardAuthority]` (`SignerWeight: 1`) e `masterDisabled: true`.
  - `capabilities.nftokenMintOfferEnabled`: esito validato sull’oggetto `Amendments` del ledger Testnet.
- Se alcuni indirizzi sono già stati generati da Persona A, passarli con `--participants <file.json>`. Una seconda esecuzione su vault già pronti non invia nuove transazioni.

## 2. Contratti ed API di `xrpl/escrow` per Persona A e Persona C

Punto d’ingresso: `xrpl/escrow/index.ts` (tipi condivisi in `xrpl/shared/escrow-order.ts` e `xrpl/shared/signer.ts`).

- **Riparto importi interi (`splitRentalAmount(grossDrops, feeBps)`):**
  - Calcola `feeDrops = floor(grossDrops * feeBps / 10000)` e `netDrops = grossDrops - feeDrops` in drops interi (es. `10000000` drops al `1000` bps = `1000000` all’ente + `9000000` netto escrow).
- **Deposito temporale per ordine (`EscrowService.deposit(order, bobSigner)`):**
  - Verifica sul ledger che il vault abbia i 3 firmatari attesi e la master key disabilitata, poi invia `EscrowCreate` da `bob` verso `order.vault` con `FinishAfter = endAt`, senza `Condition` e senza `CancelAfter`. Restituisce hash, stato e `escrowObjectId`.
- **Verifica su snapshot condiviso (`EscrowLedger.verifyEscrowAt(order, snapshot)`):**
  - Da invocare sullo stesso `ValidatedLedger` usato per `account_nfts`. Distingue `'missing'`, `'pending'`, `'mismatch'`, `'locked'` (affitto finanziato), `'releasable'` ("sbloccabile") e `'credited_to_vault'` ("accreditato al vault"). Solleva `LedgerUnavailable` (`503`) se il nodo non espone uno snapshot validato recente.
- **Sblocco a maturazione (`EscrowService.releaseToVault(order, createHash, operatorSigner)`):**
  - Superato `FinishAfter` sul tempo del ledger, invia `EscrowFinish` dall’account operativo e restituisce la ricevuta di accredito sul vault.
- **Liquidazione multifirma 2-su-3 (`prepareVaultPayout` + `addVaultSignature` oppure `settleVault`):**
  - Prepara una sola volta `Payment` con `SigningPubKey: ""` e `client.autofill(tx, 2)` (`Fee >= 3x`). Espone `phase: 'awaiting_signatures'` ("in attesa di firma") finché non arrivano due firme valide coerenti con `VaultResolutionMode` (`'ordinary'`, `'arbitration_alice'`, `'arbitration_bob'`, `'inadmissible_refund'`), poi combina i blob con `xrpl.multisign`, registra l’hash prima del `submit`, espone `'awaiting_ledger'` ("in attesa del ledger") e verifica `delivered_amount === netDrops` (es. tutti i 9 XRP al beneficiario).
- **Rimborso fee per checkout interrotto (`EscrowService.refundFee(order, acceptOfferHash, authoritySigner)`):**
  - Dopo `checkoutDeadline`, riconcilia prima eventuali depositi `pending`, controlla l’assenza di escrow attivi di Bob, verifica nei metadati validati di `NFTokenAcceptOffer` che la fee sia stata realmente incassata dall’ente e invia al massimo un `Payment` di `feeDrops` a Bob.
- **Riconciliazione e sblocco riserva vault (`EscrowService.reconcileOrder(orderId)`):**
  - Riconcilia tutti i tentativi di un ordine in `AttemptStore` (`escrow-attempts.sqlite`) e indica tramite `canReleaseVault` quando il backend SQLite può riassegnare il vault a un nuovo ordine.

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
