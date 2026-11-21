import { closeSync, mkdirSync, openSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { VaultResolutionMode, VaultScenario } from '../shared/escrow-order.js'
import type { CatalogResourceConfig, OrderLifecycleStatus } from '../shared/demo-contract.js'

export class ConflictError extends Error {
  constructor(
    public readonly code: 'PERIOD_ALREADY_RESERVED' | 'VAULT_BUSY' | 'ORDER_EXISTS',
    message: string,
  ) {
    super(message)
    this.name = 'ConflictError'
  }
}

export interface SessionRecord {
  readonly sessionRef: string
  readonly address: string | null
  readonly createdAt: number
  readonly expiresAt: number
}

export interface ListingRecord {
  readonly listingId: string
  readonly resourceId: string
  readonly alice: string
  readonly currentRevision: number
  readonly status: 'open' | 'closed'
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ListingRevisionRecord {
  readonly listingId: string
  readonly revision: number
  readonly resourceId: string
  readonly titleNftId: string
  readonly issuer: string
  readonly alice: string
  readonly startsAt: string
  readonly endsAt: string
  readonly priceDrops: string
  readonly feeBps: number
  readonly feeDrops: string
  readonly netDrops: string
  readonly proposalHash: string
  readonly proposalJson: string
  readonly proofJson: string
  readonly status: 'active' | 'superseded' | 'rejected'
  readonly createdAt: string
}

export interface OrderRecord {
  readonly orderId: string
  readonly listingId: string
  readonly revision: number
  readonly resourceId: string
  readonly scenario: VaultScenario
  readonly alice: string
  readonly bob: string
  readonly issuer: string
  readonly vault: string
  readonly startsAt: string
  readonly endsAt: string
  readonly fundBy: string
  readonly priceDrops: string
  readonly feeBps: number
  readonly feeDrops: string
  readonly netDrops: string
  readonly proposalHash: string
  readonly agreementHash: string
  readonly bundleJson: string
  readonly status: OrderLifecycleStatus
  readonly rejectionReason: string | null
  readonly pendingStep: string | null
  readonly calendarHeld: number
  readonly vaultHeld: number
  readonly passNftId: string | null
  readonly offerId: string | null
  readonly mintTxHash: string | null
  readonly mintLedgerHash: string | null
  readonly mintLedgerIndex: number | null
  readonly offerTxHash: string | null
  readonly offerLedgerHash: string | null
  readonly offerLedgerIndex: number | null
  readonly acceptOfferHash: string | null
  readonly acceptLedgerHash: string | null
  readonly acceptLedgerIndex: number | null
  readonly createHash: string | null
  readonly escrowObjectId: string | null
  readonly escrowSequence: number | null
  readonly depositLedgerHash: string | null
  readonly depositLedgerIndex: number | null
  readonly releaseTxHash: string | null
  readonly releaseLedgerHash: string | null
  readonly releaseLedgerIndex: number | null
  readonly payoutTxHash: string | null
  readonly payoutLedgerHash: string | null
  readonly payoutLedgerIndex: number | null
  readonly payoutBeneficiary: string | null
  readonly payoutDeliveredDrops: string | null
  readonly payoutResolutionMode: VaultResolutionMode | null
  readonly burnTxHash: string | null
  readonly burnLedgerHash: string | null
  readonly burnLedgerIndex: number | null
  readonly feeRefundDue: number | null
  readonly refundTxHash: string | null
  readonly refundLedgerHash: string | null
  readonly refundLedgerIndex: number | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface BillboardPublicationRecord {
  readonly id: number
  readonly resourceId: string
  readonly orderId: string
  readonly mimeType: string
  readonly filePath: string
  readonly width: number
  readonly height: number
  readonly publishedBy: string
  readonly publishedAt: string
  readonly expiresAt: string
}

export class AppStore {
  readonly db: DatabaseSync

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const dbPath = join(directory, 'marketplace.sqlite')
    closeSync(openSync(dbPath, 'a', 0o600))
    this.db = new DatabaseSync(dbPath)
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = FULL;

      CREATE TABLE IF NOT EXISTS sessions (
        sessionRef TEXT PRIMARY KEY,
        address TEXT,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS resources (
        resourceId TEXT PRIMARY KEY,
        aliasesJson TEXT NOT NULL,
        displayName TEXT NOT NULL,
        serviceType TEXT NOT NULL,
        scenario TEXT NOT NULL,
        authorityName TEXT NOT NULL,
        issuer TEXT NOT NULL,
        alice TEXT NOT NULL,
        titleNftId TEXT NOT NULL,
        validFrom TEXT NOT NULL,
        validTo TEXT NOT NULL,
        vault TEXT NOT NULL,
        vaultSignersJson TEXT NOT NULL,
        feeBps INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS listings (
        listingId TEXT PRIMARY KEY,
        resourceId TEXT NOT NULL,
        alice TEXT NOT NULL,
        currentRevision INTEGER NOT NULL,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS listing_revisions (
        listingId TEXT NOT NULL,
        revision INTEGER NOT NULL,
        resourceId TEXT NOT NULL,
        titleNftId TEXT NOT NULL,
        issuer TEXT NOT NULL,
        alice TEXT NOT NULL,
        startsAt TEXT NOT NULL,
        endsAt TEXT NOT NULL,
        priceDrops TEXT NOT NULL,
        feeBps INTEGER NOT NULL,
        feeDrops TEXT NOT NULL,
        netDrops TEXT NOT NULL,
        proposalHash TEXT NOT NULL,
        proposalJson TEXT NOT NULL,
        proofJson TEXT NOT NULL,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (listingId, revision)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS orders (
        orderId TEXT PRIMARY KEY,
        listingId TEXT NOT NULL,
        revision INTEGER NOT NULL,
        resourceId TEXT NOT NULL,
        scenario TEXT NOT NULL,
        alice TEXT NOT NULL,
        bob TEXT NOT NULL,
        issuer TEXT NOT NULL,
        vault TEXT NOT NULL,
        startsAt TEXT NOT NULL,
        endsAt TEXT NOT NULL,
        fundBy TEXT NOT NULL,
        priceDrops TEXT NOT NULL,
        feeBps INTEGER NOT NULL,
        feeDrops TEXT NOT NULL,
        netDrops TEXT NOT NULL,
        proposalHash TEXT NOT NULL,
        agreementHash TEXT NOT NULL,
        bundleJson TEXT NOT NULL,
        status TEXT NOT NULL,
        rejectionReason TEXT,
        pendingStep TEXT,
        calendarHeld INTEGER NOT NULL,
        vaultHeld INTEGER NOT NULL,
        passNftId TEXT,
        offerId TEXT,
        mintTxHash TEXT,
        mintLedgerHash TEXT,
        mintLedgerIndex INTEGER,
        offerTxHash TEXT,
        offerLedgerHash TEXT,
        offerLedgerIndex INTEGER,
        acceptOfferHash TEXT,
        acceptLedgerHash TEXT,
        acceptLedgerIndex INTEGER,
        createHash TEXT,
        escrowObjectId TEXT,
        escrowSequence INTEGER,
        depositLedgerHash TEXT,
        depositLedgerIndex INTEGER,
        releaseTxHash TEXT,
        releaseLedgerHash TEXT,
        releaseLedgerIndex INTEGER,
        payoutTxHash TEXT,
        payoutLedgerHash TEXT,
        payoutLedgerIndex INTEGER,
        payoutBeneficiary TEXT,
        payoutDeliveredDrops TEXT,
        payoutResolutionMode TEXT,
        burnTxHash TEXT,
        burnLedgerHash TEXT,
        burnLedgerIndex INTEGER,
        feeRefundDue INTEGER,
        refundTxHash TEXT,
        refundLedgerHash TEXT,
        refundLedgerIndex INTEGER,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS one_open_order_per_vault
        ON orders(vault) WHERE vaultHeld = 1;

      CREATE INDEX IF NOT EXISTS orders_resource_calendar
        ON orders(resourceId, calendarHeld, startsAt, endsAt);

      CREATE TABLE IF NOT EXISTS billboard_publications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resourceId TEXT NOT NULL,
        orderId TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        filePath TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        publishedBy TEXT NOT NULL,
        publishedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      ) STRICT;
    `)
  }

  close(): void {
    this.db.close()
  }

  createOrRefreshPendingSession(sessionRef: string, nowMs: number, ttlMs = 24 * 60 * 60 * 1000): SessionRecord {
    const expiresAt = nowMs + ttlMs
    this.db
      .prepare(
        `
        INSERT INTO sessions (sessionRef, address, createdAt, expiresAt)
        VALUES (?, NULL, ?, ?)
        ON CONFLICT(sessionRef) DO UPDATE SET
          expiresAt = excluded.expiresAt
      `,
      )
      .run(sessionRef, nowMs, expiresAt)
    return this.getSession(sessionRef, nowMs)!
  }

  authenticateSession(sessionRef: string, address: string, nowMs: number, ttlMs = 24 * 60 * 60 * 1000): SessionRecord {
    const expiresAt = nowMs + ttlMs
    this.db
      .prepare(
        `
        INSERT INTO sessions (sessionRef, address, createdAt, expiresAt)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(sessionRef) DO UPDATE SET
          address = excluded.address,
          expiresAt = excluded.expiresAt
      `,
      )
      .run(sessionRef, address, nowMs, expiresAt)
    return this.getSession(sessionRef, nowMs)!
  }

  getSession(sessionRef: string, nowMs: number): SessionRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE sessionRef = ? AND expiresAt > ?')
      .get(sessionRef, nowMs) as SessionRecord | undefined
    return row
  }

  deleteSession(sessionRef: string): void {
    this.db.prepare('DELETE FROM sessions WHERE sessionRef = ?').run(sessionRef)
  }

  upsertResource(resource: CatalogResourceConfig): void {
    this.db
      .prepare(
        `
        INSERT INTO resources (
          resourceId, aliasesJson, displayName, serviceType, scenario, authorityName,
          issuer, alice, titleNftId, validFrom, validTo, vault, vaultSignersJson, feeBps
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(resourceId) DO UPDATE SET
          aliasesJson = excluded.aliasesJson,
          displayName = excluded.displayName,
          serviceType = excluded.serviceType,
          scenario = excluded.scenario,
          authorityName = excluded.authorityName,
          issuer = excluded.issuer,
          alice = excluded.alice,
          titleNftId = excluded.titleNftId,
          validFrom = excluded.validFrom,
          validTo = excluded.validTo,
          vault = excluded.vault,
          vaultSignersJson = excluded.vaultSignersJson,
          feeBps = excluded.feeBps
      `,
      )
      .run(
        resource.resourceId,
        JSON.stringify(resource.aliases),
        resource.displayName,
        resource.serviceType,
        resource.scenario,
        resource.authorityName,
        resource.issuer,
        resource.alice,
        resource.titleNftId,
        resource.validFrom,
        resource.validTo,
        resource.vault,
        JSON.stringify(resource.vaultSigners),
        resource.feeBps,
      )
  }

  private rowToResource(row: Record<string, unknown>): CatalogResourceConfig {
    return {
      resourceId: String(row.resourceId),
      aliases: JSON.parse(String(row.aliasesJson)) as string[],
      displayName: String(row.displayName),
      serviceType: String(row.serviceType) as 'cad_portal' | 'digital_billboard',
      scenario: String(row.scenario) as VaultScenario,
      authorityName: String(row.authorityName),
      issuer: String(row.issuer),
      alice: String(row.alice),
      titleNftId: String(row.titleNftId),
      validFrom: String(row.validFrom),
      validTo: String(row.validTo),
      vault: String(row.vault),
      vaultSigners: JSON.parse(String(row.vaultSignersJson)) as [string, string, string],
      feeBps: Number(row.feeBps),
    }
  }

  listResources(): CatalogResourceConfig[] {
    const rows = this.db.prepare('SELECT * FROM resources ORDER BY resourceId ASC').all() as Array<
      Record<string, unknown>
    >
    return rows.map((r) => this.rowToResource(r))
  }

  getResource(resourceId: string): CatalogResourceConfig | undefined {
    const row = this.db
      .prepare('SELECT * FROM resources WHERE resourceId = ?')
      .get(resourceId) as Record<string, unknown> | undefined
    if (row) return this.rowToResource(row)
    const all = this.listResources()
    return all.find((r) => r.aliases.includes(resourceId))
  }

  saveListingRevision(input: {
    readonly listingId: string
    readonly resourceId: string
    readonly titleNftId: string
    readonly issuer: string
    readonly alice: string
    readonly revision: number
    readonly startsAt: string
    readonly endsAt: string
    readonly priceDrops: string
    readonly feeBps: number
    readonly feeDrops: string
    readonly netDrops: string
    readonly proposalHash: string
    readonly proposalJson: string
    readonly proofJson: string
    readonly nowUtc: string
  }): { readonly listing: ListingRecord; readonly revision: ListingRevisionRecord } {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const existing = this.db
        .prepare('SELECT * FROM listings WHERE listingId = ?')
        .get(input.listingId) as ListingRecord | undefined

      if (!existing) {
        if (input.revision !== 1) {
          throw new Error('La prima revisione di un annuncio deve avere revision = 1.')
        }
        this.db
          .prepare(
            `
            INSERT INTO listings (listingId, resourceId, alice, currentRevision, status, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, 'open', ?, ?)
          `,
          )
          .run(input.listingId, input.resourceId, input.alice, input.revision, input.nowUtc, input.nowUtc)
      } else {
        if (existing.resourceId !== input.resourceId || existing.alice !== input.alice) {
          throw new Error('Risorsa o titolare non coerenti con l’annuncio esistente.')
        }
        if (input.revision !== existing.currentRevision + 1) {
          throw new Error(
            `Revisione attesa ${existing.currentRevision + 1}, ricevuta ${input.revision}.`,
          )
        }
        this.db
          .prepare(
            `UPDATE listing_revisions SET status = 'superseded' WHERE listingId = ? AND status = 'active'`,
          )
          .run(input.listingId)
        this.db
          .prepare(
            `UPDATE listings SET currentRevision = ?, status = 'open', updatedAt = ? WHERE listingId = ?`,
          )
          .run(input.revision, input.nowUtc, input.listingId)
      }

      this.db
        .prepare(
          `
          INSERT INTO listing_revisions (
            listingId, revision, resourceId, titleNftId, issuer, alice,
            startsAt, endsAt, priceDrops, feeBps, feeDrops, netDrops,
            proposalHash, proposalJson, proofJson, status, createdAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        `,
        )
        .run(
          input.listingId,
          input.revision,
          input.resourceId,
          input.titleNftId,
          input.issuer,
          input.alice,
          input.startsAt,
          input.endsAt,
          input.priceDrops,
          input.feeBps,
          input.feeDrops,
          input.netDrops,
          input.proposalHash,
          input.proposalJson,
          input.proofJson,
          input.nowUtc,
        )

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    return {
      listing: this.getListing(input.listingId)!,
      revision: this.getListingRevision(input.listingId, input.revision)!,
    }
  }

  markListingRevisionRejected(listingId: string, revision: number): void {
    this.db
      .prepare(`UPDATE listing_revisions SET status = 'rejected' WHERE listingId = ? AND revision = ?`)
      .run(listingId, revision)
  }

  getListing(listingId: string): ListingRecord | undefined {
    return this.db.prepare('SELECT * FROM listings WHERE listingId = ?').get(listingId) as
      | ListingRecord
      | undefined
  }

  getListingRevision(listingId: string, revision: number): ListingRevisionRecord | undefined {
    return this.db
      .prepare('SELECT * FROM listing_revisions WHERE listingId = ? AND revision = ?')
      .get(listingId, revision) as ListingRevisionRecord | undefined
  }

  listListings(): Array<ListingRecord & { readonly latestRevision: ListingRevisionRecord }> {
    const listings = this.db
      .prepare('SELECT * FROM listings ORDER BY createdAt DESC')
      .all() as unknown as ListingRecord[]
    return listings.map((l) => ({
      ...l,
      latestRevision: this.getListingRevision(l.listingId, l.currentRevision)!,
    }))
  }

  /**
   * Unica transazione SQLite che controlla sovrapposizione sul calendario e unicità del vault
   * prima di aprire l'ordine.
   */
  reserveOrderAtomically(input: {
    readonly orderId: string
    readonly listingId: string
    readonly revision: number
    readonly resourceId: string
    readonly scenario: VaultScenario
    readonly alice: string
    readonly bob: string
    readonly issuer: string
    readonly vault: string
    readonly startsAt: string
    readonly endsAt: string
    readonly fundBy: string
    readonly priceDrops: string
    readonly feeBps: number
    readonly feeDrops: string
    readonly netDrops: string
    readonly proposalHash: string
    readonly agreementHash: string
    readonly bundleJson: string
    readonly nowUtc: string
  }): OrderRecord {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const dupOrder = this.db
        .prepare('SELECT orderId FROM orders WHERE orderId = ?')
        .get(input.orderId) as { orderId: string } | undefined
      if (dupOrder) {
        throw new ConflictError('ORDER_EXISTS', `Ordine ${input.orderId} già registrato.`)
      }

      const overlapping = this.db
        .prepare(
          `
          SELECT orderId FROM orders
          WHERE resourceId = ? AND calendarHeld = 1 AND startsAt < ? AND ? < endsAt
          LIMIT 1
        `,
        )
        .get(input.resourceId, input.endsAt, input.startsAt) as { orderId: string } | undefined
      if (overlapping) {
        throw new ConflictError(
          'PERIOD_ALREADY_RESERVED',
          `Periodo già riservato dall’ordine ${overlapping.orderId}.`,
        )
      }

      const busyVault = this.db
        .prepare('SELECT orderId FROM orders WHERE vault = ? AND vaultHeld = 1 LIMIT 1')
        .get(input.vault) as { orderId: string } | undefined
      if (busyVault) {
        throw new ConflictError(
          'VAULT_BUSY',
          `Vault ${input.vault} già impegnato dall’ordine aperto ${busyVault.orderId}.`,
        )
      }

      this.db
        .prepare(
          `
          INSERT INTO orders (
            orderId, listingId, revision, resourceId, scenario, alice, bob, issuer, vault,
            startsAt, endsAt, fundBy, priceDrops, feeBps, feeDrops, netDrops,
            proposalHash, agreementHash, bundleJson, status, rejectionReason, pendingStep,
            calendarHeld, vaultHeld, createdAt, updatedAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting_authority', NULL, NULL, 1, 1, ?, ?)
        `,
        )
        .run(
          input.orderId,
          input.listingId,
          input.revision,
          input.resourceId,
          input.scenario,
          input.alice,
          input.bob,
          input.issuer,
          input.vault,
          input.startsAt,
          input.endsAt,
          input.fundBy,
          input.priceDrops,
          input.feeBps,
          input.feeDrops,
          input.netDrops,
          input.proposalHash,
          input.agreementHash,
          input.bundleJson,
          input.nowUtc,
          input.nowUtc,
        )

      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      if (error instanceof ConflictError) throw error
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('one_open_order_per_vault') || msg.includes('UNIQUE constraint')) {
        throw new ConflictError(
          'VAULT_BUSY',
          `Vault ${input.vault} già impegnato da un altro ordine aperto.`,
        )
      }
      throw error
    }

    return this.getOrder(input.orderId)!
  }

  getOrder(orderId: string): OrderRecord | undefined {
    return this.db.prepare('SELECT * FROM orders WHERE orderId = ?').get(orderId) as
      | OrderRecord
      | undefined
  }

  listOrders(resourceId?: string): OrderRecord[] {
    if (resourceId) {
      return this.db
        .prepare('SELECT * FROM orders WHERE resourceId = ? ORDER BY createdAt DESC, rowid DESC')
        .all(resourceId) as unknown as OrderRecord[]
    }
    return this.db
      .prepare('SELECT * FROM orders ORDER BY createdAt DESC, rowid DESC')
      .all() as unknown as OrderRecord[]
  }

  listOrdersForResource(resourceId: string): OrderRecord[] {
    return this.db
      .prepare('SELECT * FROM orders WHERE resourceId = ? ORDER BY startsAt ASC, rowid DESC')
      .all(resourceId) as unknown as OrderRecord[]
  }

  updateOrder(
    orderId: string,
    patch: Partial<Omit<OrderRecord, 'orderId' | 'createdAt'>>,
  ): OrderRecord {
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return this.getOrder(orderId)!
    const sets = entries.map(([k]) => `${k} = ?`).join(', ')
    const values = entries.map(([, v]) => v as string | number | null)
    this.db.prepare(`UPDATE orders SET ${sets} WHERE orderId = ?`).run(...values, orderId)
    return this.getOrder(orderId)!
  }

  saveBillboardPublication(input: {
    readonly resourceId: string
    readonly orderId: string
    readonly mimeType: string
    readonly filePath: string
    readonly width: number
    readonly height: number
    readonly publishedBy: string
    readonly publishedAt: string
    readonly expiresAt: string
  }): BillboardPublicationRecord {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare('DELETE FROM billboard_publications WHERE resourceId = ?')
        .run(input.resourceId)
      const info = this.db
        .prepare(
          `
          INSERT INTO billboard_publications (
            resourceId, orderId, mimeType, filePath, width, height,
            publishedBy, publishedAt, expiresAt
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          input.resourceId,
          input.orderId,
          input.mimeType,
          input.filePath,
          input.width,
          input.height,
          input.publishedBy,
          input.publishedAt,
          input.expiresAt,
        )
      this.db.exec('COMMIT')
      return this.db
        .prepare('SELECT * FROM billboard_publications WHERE id = ?')
        .get(Number(info.lastInsertRowid)) as unknown as BillboardPublicationRecord
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  getBillboardPublication(resourceId: string): BillboardPublicationRecord | undefined {
    return this.db
      .prepare('SELECT * FROM billboard_publications WHERE resourceId = ? ORDER BY id DESC LIMIT 1')
      .get(resourceId) as BillboardPublicationRecord | undefined
  }

  clearBillboardPublication(resourceId: string): void {
    this.db.prepare('DELETE FROM billboard_publications WHERE resourceId = ?').run(resourceId)
  }

  resetDemoDomainData(): void {
    this.db.exec(`
      BEGIN IMMEDIATE;
      DELETE FROM billboard_publications;
      DELETE FROM orders;
      DELETE FROM listing_revisions;
      DELETE FROM listings;
      COMMIT;
    `)
  }
}
