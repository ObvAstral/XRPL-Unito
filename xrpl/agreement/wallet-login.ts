import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { verifyWalletSignature, type LocalSigner } from './wallet.js'

export type LoginChallenge = {
  id: string
  domain: string
  network: 'testnet'
  expiresAt: number
  sessionRef: string
}

function domainName(domain: string): string {
  if (!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(domain) || new URL('https://' + domain).host !== domain) {
    throw new Error('Canonical application domain is required.')
  }
  return domain
}

export function signLogin(challenge: LoginChallenge, expectedDomain: string, signer: LocalSigner, now = Date.now()) {
  if (challenge.domain !== domainName(expectedDomain) || challenge.network !== 'testnet'
    || !/^[0-9a-f]{64}$/.test(challenge.id) || !challenge.sessionRef
    || !Number.isSafeInteger(challenge.expiresAt) || challenge.expiresAt <= now) {
    throw new Error('Invalid login challenge for this domain.')
  }
  const { id, domain, network, expiresAt, sessionRef } = challenge
  return signer.signMessage('login', { id, domain, network, expiresAt, sessionRef })
}

/** sessionRef must come from the server-side pending browser session. */
export class WalletLogin {
  private readonly db: DatabaseSync
  private readonly domain: string

  constructor(filename: string, domain: string, private readonly clock = Date.now) {
    this.domain = domainName(domain)
    this.db = new DatabaseSync(filename)
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS wallet_challenges (
        id TEXT PRIMARY KEY, domain TEXT NOT NULL, sessionRef TEXT NOT NULL, expiresAt INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS wallet_challenge_expiry ON wallet_challenges(expiresAt);
    `)
  }

  issue(sessionRef: string): LoginChallenge {
    if (!sessionRef) throw new Error('Pending session reference required.')
    const now = this.clock()
    const challenge: LoginChallenge = {
      id: randomBytes(32).toString('hex'), domain: this.domain, network: 'testnet',
      expiresAt: now + 120_000, sessionRef,
    }
    this.db.prepare('DELETE FROM wallet_challenges WHERE expiresAt <= ?').run(now)
    this.db.prepare('INSERT INTO wallet_challenges VALUES (?, ?, ?, ?)')
      .run(challenge.id, this.domain, sessionRef, challenge.expiresAt)
    return challenge
  }

  consume(id: string, sessionRef: string, proof: unknown): { address: string } {
    const challenge = this.db.prepare(
      'SELECT expiresAt FROM wallet_challenges WHERE id = ? AND domain = ? AND sessionRef = ? AND expiresAt > ?',
    ).get(id, this.domain, sessionRef, this.clock())
    if (!challenge) throw new Error('Login challenge expired, consumed, or foreign to this session.')
    const address = verifyWalletSignature('login', {
      id, domain: this.domain, network: 'testnet', expiresAt: Number(challenge.expiresAt), sessionRef,
    }, proof)
    const deleted = this.db.prepare(
      'DELETE FROM wallet_challenges WHERE id = ? AND domain = ? AND sessionRef = ? AND expiresAt > ?',
    ).run(id, this.domain, sessionRef, this.clock())
    if (deleted.changes !== 1) throw new Error('Login challenge already consumed or expired.')
    return { address }
  }

  close() {
    this.db.close()
  }
}
