# XRPL UniTo · Renting temporary usage rights

Alice holds an annual CAD license, but her seat will sit idle in August. She can list that month on the marketplace, set a price, and rent the seat to Bob with the software provider’s approval. Alice keeps the NFT that represents her license. Bob receives a separate NFT pass that lets him use the seat for the agreed period.

The prototype uses the **XRP Ledger (XRPL)** to record ownership, issue rental passes, and settle payments in XRP. The service that controls the resource checks Bob’s pass, his deposit, and the rental dates before granting access. His access ends when the rental expires, even if Alice’s payout is still pending.

## Use cases

| Resource | Who approves the rental? | What happens during and after the rental? |
| --- | --- | --- |
| **CAD seat** | The software provider | Bob can open the demo project while the seat is reserved for him. At the end of the rental, the portal closes his project. Alice can open it again if her license is still valid and the seat is available. |
| **Digital billboard** | The Municipality of Turin, simulated in the demo | Alice holds the right to use the `torino-01` display. Bob rents a time slot and can publish an image during that slot. The screen stays blank until he publishes and goes blank again when the slot ends. |

Both rentals follow the same payment flow. Alice signs the listing, Bob signs the order, and the approving authority issues the pass. In the **10 XRP** demo, Bob pays the authority **1 XRP** when he accepts the pass and locks the remaining **9 XRP** in escrow until the rental ends. The funds can then be released to the resource’s *vault*, an account controlled by Alice, Bob, and the authority. In a routine settlement, Alice and Bob sign the payment that sends the 9 XRP to Alice.

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
