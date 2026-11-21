# XRPL UniTo · Renting temporary usage rights

A rights holder can rent out the use of a resource for a fixed period while keeping the underlying title. The prototype uses the **XRP Ledger (XRPL)** to record who holds the title and the rental pass, lock the rent until expiry, and settle the payment. The service that controls the resource enforces access using those ledger records and the dates in the signed agreement.

## How a rental works

### The title, the rental pass, and the oracle

The resource authority issues a **title NFT** that identifies the holder’s underlying right. It stays in the holder’s wallet throughout the rental. To rent out a time slot, the holder signs a listing with the title ID, dates, price, and authority fee. The renter signs an order that references the listing by its hash. Both signatures are made off-chain.

The authority acts as the **oracle** for that resource. It decides whether to authorize the rental under its own rules. To approve, it signs an `NFTokenMint` transaction and offers a separate **rental pass NFT** to the renter’s wallet. The pass has an immutable URI containing the SHA-256 hash of the order. Because the order also contains the listing hash, the service can verify exactly which parties, resource, dates, and price the authority approved. The renter cannot transfer the pass to another user.

### Funding the rental and granting access

The renter makes two transactions. First, `NFTokenAcceptOffer` delivers the pass and pays the authority’s fee in a single transaction. Then `EscrowCreate` locks the rest of the rent in XRP, with the resource’s shared account (the *vault*) as the destination and `FinishAfter` set to the rental end time. For a **10 XRP** rental with a **10%** fee, the authority receives **1 XRP** and **9 XRP** enter escrow.

When the renter requests access, the service checks the authenticated wallet and the rental dates. It verifies the holder’s title, the renter’s exact pass and its issuer, and the order’s escrow deposit against the same validated ledger snapshot. During the agreed interval, the funded pass gives the renter exclusive use. At expiry the service ends access, even if the pass is still in the wallet and the payout is still pending.

### Releasing escrow and settling with two signatures

Once the ledger time has passed `FinishAfter`, the operator submits `EscrowFinish` to move the locked XRP into the vault. This transaction has a fixed destination. Choosing who receives the funds from the vault happens in a separate `Payment`.

The vault has three signers (the holder, the renter, and the oracle), a **2-of-3** quorum, and a disabled master key. Two signers must authorize the same payment, including its amount and destination. In a routine settlement, the holder and renter can sign together to pay the holder. In a dispute, the application lets the oracle co-sign with the holder to release the rent to them, or with the renter to return it. The oracle’s signature alone can approve a rental pass, but moving money out of the vault always takes a second signer.

## Use cases

In both demos, Alice holds the title and Bob rents a time slot. Each resource has its own authority and vault.

| Resource | Who approves the rental? | What happens during and after the rental? |
| --- | --- | --- |
| **CAD seat** | The software provider | Bob can open the demo project while the seat is reserved for him. At the end of the rental, the portal closes his project. Alice can open it again if her license is still valid and the seat is available. |
| **Digital billboard** | The Municipality of Turin, simulated in the demo | Alice holds the right to use the `torino-01` display. Bob rents a time slot and can publish an image during that slot. The screen stays blank until he publishes and goes blank again when the slot ends. |

## Build and run the demo

You need **Node.js 22.13.0 or later** and **npm**. Run these commands from the repository root.

```sh
npm --prefix xrpl ci
npm --prefix xrpl start
```

The `start` script compiles the TypeScript source into `xrpl/dist/` and starts the server in **local simulation mode**. The app creates demo wallets and stores its state in SQLite. You can try both scenarios without setting up a wallet or connecting to the Testnet.

| Page | Local address |
| --- | --- |
| Marketplace — choose a role, publish listings, and manage orders | [http://127.0.0.1:3000/](http://127.0.0.1:3000/) |
| CAD portal — check access and open the demo project | [http://127.0.0.1:3000/cad](http://127.0.0.1:3000/cad) |
| Public billboard display — view the image currently on screen | [http://127.0.0.1:3000/schermo/torino-01](http://127.0.0.1:3000/schermo/torino-01) |

Press `Ctrl+C` to stop the server. To compile the project on its own, run `npm --prefix xrpl run build`. To compile and run the automated tests, use `npm --prefix xrpl test`.

### Watch a CAD rental expire

1. Open the marketplace and choose **Bob**. Under **Simulation controls**, select the **Active rental** CAD scenario and click **Load scenario**. Loading a scenario replaces the current simulation’s listings, orders, and billboard images.
2. Open the CAD portal in a second tab in the same browser and click **Open demo project**. Bob already holds the pass and has funded the order, so the project opens.
3. Leave the project open. In the marketplace’s simulation controls, click **Jump to rental end**. Return to the CAD tab to see that Bob’s project has closed. Switch to Alice and open the project again.

### Publish an image on the billboard

Choose **Advertising Billboard** in the marketplace. Publish a listing as **Alice**, accept it as **Bob**, and approve the rental as **Municipality of Turin**. Switch back to Bob to accept the pass and fund the escrow. Once the rental starts, click **Use a sample image** and open the public billboard display to see the image on `torino-01`.

### Run on the XRPL Testnet (optional)

To try the payment flow on the public test network, you need access to the Testnet and its faucet. After installing the dependencies, stop the local server if it is running and run these commands from the repository root.

```sh
npm --prefix xrpl run setup:wallets
XRPL_MODE=testnet npm --prefix xrpl start
```

The first command sets up development wallets and two **2-of-3 multisignature vaults**, one for the CAD seat and one for the billboard. The second starts the same three pages backed by the Testnet. The app stores development keys and local data in `xrpl/.xrpl-local/`, which Git ignores.
