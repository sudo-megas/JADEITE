# Realisation IX — Backup, Transfer & Hardening

Companion notes to `REALISATION.md` and `XJADEITE.md`. The first rung that writes a
file the application will later have to trust, and therefore the first whose central
question is not *what should this do* but *what must it refuse*. Realisation VII
opened a socket and had to distrust an unofficial source; this one opens a file
picker and has to distrust the owner's own archive drive, which is a stranger
proposition and a more consequential one — the container is the only path by which
this application can be told something it did not itself write.

---

## 1. One question had to be answered before the container existed, and it was not a code question

XJADEITE §20 Q2 asked what **merge** should mean for `.jbk` import, and — unusually
for an open item — said *when*: "to be settled before Realisation IX designs the
container, not during it." That instruction is the whole of this section's interest,
because on the face of it Q2 changes nothing here. Merge is not built in this rung.
§15 puts only full replacement in it. A question about a feature two rungs away
should not block a container.

It blocks it because a container format cannot grow a field retroactively. Every
`.jbk` the owner writes this year has to remain answerable when the chooser is
eventually built, and whatever that chooser needs to read must already be inside
files written before it existed. So Q2 is not really a question about merge. It is a
question about **what the first container must carry**, and the three candidate
answers have wildly different costs at exactly this moment:

| Reading | What the container must carry | Cost now |
|---|---|---|
| Row-level newest-wins | `updated_at` on every user table, inside the payload | A migration touching every table, a change to every write path in four released sections, and a backfilled timestamp on every existing row |
| Review screen | The same, plus per-row identity | The same, plus a page |
| **Per-section choice** | A vault lineage id and four timestamps | One migration that adds no table |

The owner ruled for **per-section choice** on 31 July 2026. The deciding argument was
not the cost. It was that row-level newest-wins is the only one of the three that can
discard an edit without showing anyone a screen, and that its backfill would have
written a fabricated timestamp onto every row that exists today — a fact invented to
support a rule, carried forever in a file whose whole purpose is to be trusted years
later. Replacement-only was available and cheaper still, and was not taken: it
reverses an owner ruling of 30 July that the importer's remit includes merge, and
reversing a ruling to save a migration is the wrong trade.

**What shipped is the metadata and not the feature**, and that distinction is the
point. There is no chooser, no conflict rule and no merge code anywhere in this
Realisation. There is a `vault_id` and four stamps, in every container, from the
first one.

---

## 2. The payload was measured, because guessing wrong writes the ledger out in the clear

§15 says a `.jbk` is "key envelope header + SQLCipher database + checksums". It does
not say how to get the database bytes out of an open, encrypted connection, and
`better-sqlite3-multiple-ciphers` offers three ways that look equivalent from the
manifest. They are not equivalent, and the failure mode of choosing wrong is the
owner's entire financial history landing on an archive drive readable by anything.

Reading the library's C source produced a confident inference — that `db.backup()`
never keys its destination handle, that `VACUUM INTO` has no codec hook, and that
`SQLITE_USE_URI=0` closes the `hexkey` escape, so both would write plaintext. The
inference was one step short of provable and the consequence was severe, so it was
measured instead, against Electron 42's actual build, on a throwaway vault carrying a
canary string.

| Method | Result |
|---|---|
| `db.backup(path)` | **Throws** — *"backup is not supported with incompatible source and target databases"* |
| `VACUUM main INTO path` | **Encrypted.** Opens under the same DEK, `user_version` preserved, generated columns intact, `integrity_check` ok, refuses a wrong key, canary absent |
| Raw byte copy after `wal_checkpoint(TRUNCATE)` | Encrypted, and identical in every respect above |

Two of the three inferences were wrong, and they were wrong in the safe direction —
which is not a reason to have skipped the measurement. `db.backup()` refuses rather
than silently writing a plaintext file, which is the best of the three failures to
have and was not predictable from the manifest.

**`VACUUM INTO` won over the raw copy**, and the margin is about where the correctness
lives rather than about the bytes. Both produce a valid container today. The raw copy
is only consistent if the WAL was checkpointed immediately before it, so its
correctness rests on a pragma call two lines earlier — a property of the *sequence*,
which a later edit can break without touching the copy. `VACUUM INTO` is consistent
by construction: it is one statement, and the statement is the guarantee. It also
compacts, which a file kept for years may as well be.

The probe is recorded here rather than kept as a test, because it measures the
library and not this application. What is kept as a test is the consequence — the
Electron suite proves a real backup opens under the DEK and a wrong key does not.

---

## 3. §4.4's two rows are two different programs, and only one of them is obvious

The Credentials & Backup Truth Table has three rows; the third is *cemetery* and needs
no code. The other two are the whole restore feature, and building only the second
would leave the first quietly broken in the exact case the table promises.

**Row 2 is the one you think of.** The disk is dead. There is no vault. The credential
being proved belongs to the *container*, and the envelope it is proved against comes
from inside the container too. It has to install both files, because the DEK that
opens that payload is wrapped in that envelope and nowhere else.

**Row 1 is the one that gets missed.** *"Every backup ever made is openable. The app
holds the DEK in memory and can open any backup of this vault regardless of the
credentials in force when it was taken."* That sentence is a promise that a backup
taken three password-resets ago still opens today, **without asking for the password
that was current then** — which is fortunate, because that password may be forgotten
and its recovery key is certainly dead. The Electron suite proves it the only way that
means anything: take a backup, reset the password so the envelope's generation
increments and the old password stops working, and then restore the older container
with no credential at all.

Row 1 also has a second half that is easy to get backwards. It installs the payload
and **keeps the envelope that is in force now**. Installing the container's own
envelope would silently reinstate the password that was current when the backup was
taken — restoring last month's *data* would restore last month's *credentials* with
it, and the owner would be locked out by a successful operation.

**Which row applies is decided, not asked.** The container carries the lineage id, so
"this is a backup of the vault that is open" is a fact the application can establish
before it touches anything. A foreign lineage is a machine transfer and proves a
credential; the vault's own is row 1. The owner is never presented with a choice they
have no way to answer.

One consequence worth naming: restoring with a **recovery key does not consume it**.
§4.3 consumes a key on *reset*, and a restore is not one — nothing is re-wrapped and
no new key is issued. The owner who restores a dead vault with the card from their
desk still holds that card afterwards, and still needs the reset ceremony to set a
password they know.

---

## 4. A vault is two files, and no filesystem renames two files at once

This is the only genuinely hard engineering problem in the rung. `jadeite.db` and
`jadeite.keys` must arrive together or not at all: new envelope over old database, or
old envelope over new database, are both a vault that opens with no credential anyone
holds. A power cut between two `rename` calls produces exactly that.

The swap is therefore made **replayable** rather than atomic. Both replacements are
written to `.incoming` siblings and flushed before anything is touched; a journal
recording the intent is written and flushed before the first rename; the renames run;
the journal is removed. A crash anywhere leaves one of three states, and each has one
correct answer:

- **No journal, stale `.incoming` files** — no rename was begun. Sweep them. §4.1 wants
  two files in that directory.
- **Journal, one or both `.incoming` still present** — replay the renames. Each is
  skipped if it already happened, which is what makes the replay safe to run twice.
- **Journal, nothing staged** — the renames finished. Remove the journal.

Recovery runs in `main/index.ts` before `registerIpcHandlers`, and therefore before
the first `vault.status()`. That ordering is the point: the renderer must never see
the half-applied state, because `vaultExists()` answering *false* over a live vault is
how a first-run ceremony could start on top of the owner's history.

Two smaller traps sit inside the same function. The outgoing pair is **copied** aside
rather than renamed — a rename would leave the target absent for the width of the
call, which is the window just described. And the `-wal` sidecar of the database being
replaced is deleted, because a stale WAL belongs to the file it was written beside and
would otherwise be replayed into an incoming database whose pages it knows nothing
about.

Nothing here is destroyed. The replaced vault is left as `.replaced-<stamp>` siblings,
following the ruling `setOrphanedDatabaseAside` already made at Realisation I: whether
to delete the owner's data is not the code's decision.

---

## 5. Verification is what makes "without partial application" true

The acceptance line reads *"rejected without a crash and without partial
application"*, and those are two separate mechanisms rather than one. Section 4 is the
second. The first is that everything which could refuse has refused before the swap
begins:

1. The file is sized before it is read, so something far too large to be a backup is
   refused rather than loaded to discover that it was.
2. The container is parsed — magic, format, declared lengths against actual length,
   both digests, then the header. Eight named rejection reasons, none of which throws.
3. The payload is staged **beside the vault**, so the rename that installs it is a
   same-filesystem rename and cannot fail across a device boundary at the one moment
   nothing may fail.
4. It is opened with the key, which proves the key. `integrity_check` proves the
   pages. `user_version` proves it is not from the future.
5. Only then does the session end and the swap begin.

The ordering inside the parser is itself a decision. Magic before length, so a text
file chosen by mistake is told it is not a backup rather than told the owner's backup
is damaged — a distinction that costs one line and matters enormously on the day a
disk dies. Lengths before slices, so a declared size can never index past the buffer.
Digests before `JSON.parse`, so the parser only ever sees bytes that arrived intact.
Schema last, because it is the only rejection that means *update the application*
rather than *find a better file*.

**The future-schema gate is the least obvious and the most load-bearing.** `migrate`
walks forward only and silently ignores a version it has never heard of. Without an
explicit refusal, a laptop running an older build would open a newer vault, skip every
migration, and misread it with no error anywhere — and rig-to-laptop transfer is
precisely what this feature exists for. The check is doubled: the header's claim is
refused at parse time, and the payload's actual `user_version` is checked again after
it is opened, because a header can lie about what it carries.

Three defects in this parser were found by the fuzz suite rather than by reading it,
which is the argument for writing that suite the way `recovery-key.test.ts` writes
its own — exhaustively, and asserting the size of the space covered. Two thousand
hostile inputs: every bit of all ninety-six preamble bytes, a hundred and sixty
truncation lengths, sampled corruption through the header and payload, lengths edited
to lie, and a thousand random buffers. Nothing accepted, nothing thrown. The three it
caught were a short file misreported as damaged, a `NaN` schema ceiling that would
have failed *open*, and `writeContainer` not validating what it wrote — the last
meaning a bad container would have been discovered at restore time, on the day it was
needed, rather than at backup time while the owner was watching.

**The acceptance suite caught two more, and they were worse.** Both were defects of
omission in exactly the places this section claims are safe, and neither was visible
from reading the function that contained it.

The first: a **refused `select` left the previous candidate armed**. The container is
held in the main process between choosing and confirming, and the rejection path
returned without clearing it. So choosing a good backup, then choosing a damaged one,
then confirming would install the *first* container — a restore of the wrong backup,
reported as a success, after the owner had been told the file they picked was damaged.
The fix belongs in `select` rather than in the IPC layer: the main process must not
depend on the renderer declining to confirm after it has been told no.

The second: **the replay path did not do the sidecar hygiene the ordinary path does**.
`commitInstall` removes the outgoing database's `-wal` — its own comment explains why —
and `completeInterruptedInstall` did not. A stale log present at replay time was
therefore replayed into the arriving database, producing a vault that passes
`integrity_check` and holds rows the backup never contained. A restore that silently
did not restore, arriving through the crash path, which is precisely the partial
application §4 exists to prevent. The crash path was less safe than the path it
finishes, which is the wrong way round.

Its fix carries a trap of its own, and it is the reason the fix is eleven lines rather
than one. The removal cannot be unconditional. Once the database rename has happened,
a `-wal` beside `jadeite.db` belongs to the *newly installed* vault and holds committed
work; deleting it to tidy up after a restore would discard the owner's rows to fix a
problem that is no longer there. The guard is whether a staged database is still
waiting — that single fact decides which vault the filename refers to, and both
branches are now asserted.

---

## 6. The stamps are kept by triggers, and three tables are deliberately excluded

Nine tables carry owner edits, written from four section modules through some forty
functions. A rule enforced in forty places is a rule that will be forgotten in the
forty-first, so the per-section timestamps of §1 are kept by SQLite triggers instead.
The migration owns them entirely; a future section module that never heard of them
still cannot bypass them.

The interesting part is the exclusions. `s3_prices_live` and `s3_price_fetch` are
written by the price provider on a timer (§14), and counting them would mark Section 3
as edited every fifteen minutes whether or not the owner had touched it. The stamp
exists to answer *which machine holds the newer work*, and a background fetch has no
opinion about that. `valuable_types` is a closed seed list only a migration writes.

Nothing is backfilled. A vault arriving at v5 has no stamps and its containers carry
null, which is the honest reading of *nothing recorded an edit time before the
triggers existed*. A chooser will show that as unknown and let the owner decide, which
is what it would do with a genuine tie anyway.

---

## 7. The restore door had to be outside the lock

Every other route to a backup in this application is behind the vault. §4.4's second
row is a dead disk. A restore feature reachable only from a vault you can open is a
restore feature for the one situation that never needed one.

So the door is on the **lock screen** and on **first-run** — the two screens a machine
with no usable vault actually shows. First-run matters as much as the lock screen and
is easier to forget: a replacement disk and a new laptop both land on the screen
offering to *create* a vault, which is exactly what neither wants, and without a door
there the owner would have to create a vault they intend to throw away in order to
reach the button that throws it away.

The post-unlock home is **Yedekleme in the rail's foot**, beside Ayarlar rather than
in the numbered list above it. The six numbered destinations are the owner's money;
this is the machine that holds it. It takes `Ctrl+B` rather than a seventh digit for
the same reason.

---

## 8. Nothing about a path crosses the bridge

`hardening.spec.ts` has asserted since Realisation I that no filesystem path is
reachable through the context bridge. A backup feature is the obvious place for the
first one to appear: `backup_log.destination` stores one, `showSaveDialog` returns
one, and a page listing past backups would want to display one.

None of them crosses. Both dialogues run in the main process, the chosen container
waits there between `select` and `restore`, and `BackupCandidate` describes what is
*in* a file and says nothing about where it is. The renderer can ask for a backup and
can confirm a restore; it cannot name a location, and could not exfiltrate one if it
were compromised.

Holding the container's **bytes** rather than its path between the two calls is a
second decision inside the first. The file that was verified is the file that gets
installed, and no amount of time spent on the confirmation screen can put a different
one there.

---

## 9. The hardening pass found four things, and three predate this rung

The pass is a scope item rather than a formality, and it earned that this time. Two
findings are measurements that confirmed a claim; four were defects, and three of them
had been in the application since Realisation I. Realisation IX is what made them
matter, because it is the rung that gave the vault a second file to be copied to and a
lineage to be lied about.

**The settings channel was generic over any key.** `settings:get` and `settings:set`
validated that the key was a string of one to sixty-four characters, and nothing else.
That was true of the table and wrong as a contract: from schema v5 the vault holds
`vault_id` and four trigger-kept stamps, and a renderer able to write them could make
this vault's own backups demand a credential — breaking §4.4's first row, which
promises the exact opposite — or fabricate the edit times a merge chooser will one day
believe. `lineage.ts` says of the id that "there is no write path to get wrong". Two
allow-lists, one for reading and a slightly wider one for writing, are what make that
sentence true rather than aspirational. It was never reachable from the interface; that
is not the standard. A boundary whose safety rests on the renderer asking only for what
it happens to need today is not a boundary.

**`config:set` was the one handler in `ipc.ts` with no guard**, in the file whose
opening paragraph says nothing throws across the bridge. Proven rather than reasoned
about: with the config directory at mode 0500, it produced `EACCES: permission denied,
open '/…/config.json.tmp'` — an absolute path, serialised by Electron into the
renderer's rejected `invoke()`. The regression test makes the write genuinely fail and
asserts the answer contains no `/`.

**Untrusted container text reached the consent screen.** `appVersion`, `createdAt` and
the four section stamps were checked for being strings and nothing else, and the header
may be 64 KiB. A crafted `.jbk` could therefore have placed sixty-four kilobytes of
chosen text beside the credential prompt — on the one surface whose whole job is §15's
*explicit confirmation*. React's escaping stops a script; it does not stop an
`appVersion` reading *"0.9.0 — verified, no credential required"*. The fuzz suite could
not have caught it, and that is the interesting part: its subject is which malformed
containers are refused, and by every rule that existed such a header was **valid**.
A version string and an ISO-8601 timestamp fit in tens of bytes, and the timestamps are
now shape-checked as well as bounded.

**Two shipping dependencies were unpinned.** `externalizeDepsPlugin()` is applied to
`main` and `preload` and not to the renderer, so Vite bundles whatever the renderer
imports regardless of how `package.json` classifies it. Confirmed in the built bundle:
`i18next` and `react-i18next` ship in the product while carrying caret ranges — the
only two ranged specifiers in the project. A fresh install on the laptop could pull a
different minor into the shipped bundle than the rig has, which is precisely what a
lockfile-pinned stack (§3.2) exists to prevent. Both are now exact. Their placement in
`devDependencies` is left alone deliberately: what electron-builder packs is
Realisation X's subject, and moving them now would change the artefact during a rung
that is not about the artefact.

Two more were corrected without being defects. `useDek`'s "synchronous by signature"
claim was enforced by nothing — a probe showed an `async` callback, one closing over
the key, and one returning it outright all compiled. The type now rejects a thenable
return, and the callback receives a **copy** that is wiped when it returns, so the
retention that still compiles yields thirty-two zero bytes. And `create()` recorded the
backup inside the `try` that guards the write, so a failed log insert answered `IO`
over a perfectly good `.jbk` sitting on the owner's drive — telling someone their
backup failed when it had not is worse than a wrong count on a page.

Finally, **the four credential ceremonies are serialised.** Argon2id is 256 MiB a
derivation and all four channels are `invoke`able as fast as the renderer likes;
measured, eight at once peaked at 1268 MiB against 243 MiB for one, at 4.67× the wall
time rather than 8×. Queued rather than refused, because a queue needs no error code,
no translation and no explanation — the honest description of two unlock attempts
arriving together is that the second waits. §3.4's ceilings exclude Argon2id time
explicitly, so nothing the specification measures moved.

### What the measurements confirmed

`npm audit --omit=dev` finds nothing. The sixteen high advisories in the full audit are
one chain — `brace-expansion` under `electron-builder` — and `npm ls --omit=dev`
returns empty for every package in it. §3.2's claim that no document-parsing library
appears in the tree was verified against the installed tree rather than repeated: the
two parser-shaped names present, `unzipper` and `@xmldom/xmldom`, both trace to
`app-builder-lib` and neither survives `--omit=dev`.

A canary written through the application's own write paths, sealed, and searched for in
the resulting container: zero occurrences, alongside zero for `SQLite format 3`, with
payload entropy 7.9986 bits per byte. The cleartext header discloses that a JADEITE
vault exists, when this copy was made, which build wrote it, how many times the owner
has reset their password, and when each of four sections was last edited. One field
outside `BackupHeader` deserves naming because a reading confined to that interface
misses it: the preamble's `payloadBytes` correlates with row count, and is the only
number in a `.jbk` that leaks a **magnitude** of how much the owner has recorded. It is
not worth padding a container for, and it is worth writing down.

---

## 10. What this Realisation proves

- That an open item can be load-bearing without changing any behaviour. Q2 shipped
  four timestamps and no feature, and the timestamps were the reason it had to be
  answered first.
- That a claim about a dependency is worth one probe. Two of three inferences about
  how this library writes an encrypted database were wrong, and the one that mattered
  most would have been the owner's ledger in the clear.
- That a truth table is only true if both of its live rows are built. Row 1 is the one
  that gets missed, and it is the one that runs on the ordinary day.
- That "without partial application" is two mechanisms — refuse before you touch
  anything, and make the touch replayable — and that a vault of two files needs the
  second because no filesystem provides it.
- That an exhaustive parser suite earns its keep on the first run. Three defects, none
  of which a reading had caught, in the only untrusted input this application has.
- That a hardening pass is a scope item and not a formality. Four more defects, three
  of them older than this rung, and the one the fuzzing could not have found — because
  a hostile container that is *valid* is not the fuzzer's subject.
