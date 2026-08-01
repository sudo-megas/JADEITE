<h1>JADEITE</h1>

<p>
  <img alt="Version"           src="https://img.shields.io/badge/version-v1.1-00A86B?style=for-the-badge">
  <img alt="Release date"      src="https://img.shields.io/badge/released-2026--08--01-00A86B?style=for-the-badge">
  <img alt="Licence"           src="https://img.shields.io/badge/licence-GPL--3.0--only-6E7B8B?style=for-the-badge">
</p>

<p>
  <img alt="Arch Linux package" src="https://img.shields.io/badge/Arch%20Linux-92%20MB-1793D1?style=for-the-badge&logo=archlinux&logoColor=white">
  <img alt="Windows installer"  src="https://img.shields.io/badge/Windows-105%20MB-0078D6?style=for-the-badge&logo=windows&logoColor=white">
</p>

*Ekonomi Defteri* · **Economy Journal**

---

## 1. DESCRIPTION

JADEITE keeps your income, expenses, payments and valuables in **one encrypted file** on your
own machine — nothing is uploaded, and nothing legible ever reaches the disk.
It opens in **Turkish** and speaks **English** if you prefer, and it works fully offline.

---

## 2. DEPENDENCIES

**To simply use it — nothing to install by hand.**

- **Windows** — none at all. The installer carries everything it needs.
- **Arch Linux** — `gtk3`, `nss`, `alsa-lib`. The package declares these three and no others,
  because those three are genuinely all it links against.

**To build it yourself:**

- **Node.js 24 or newer**, and `git`. That is the whole list.
- **Windows needs no Visual Studio and no Python.** This is worth saying plainly, because it
  is the part people expect to be false: both native pieces ship ready-built binaries for
  Windows, so nothing is compiled on your machine.

---

## 3. INSTALLATION

### 3.A Build From Source

Works the same on Linux and Windows:

```bash
git clone https://github.com/sudo-megas/JADEITE.git
cd JADEITE
npm install
node node_modules/electron/install.js
npm run build
```

Then build the package for your platform:

```bash
npm run package        # Linux  -> release/jadeite-1.1.0.pacman  and  .deb
npm run package:win    # Windows -> release/jadeite-1.1.0-setup.exe
```

Three things worth knowing:

- **`node node_modules/electron/install.js` is not optional.** Electron 42 no longer downloads
  its own binary during `npm install`, so without this step nothing will start.
- **Never build a Windows package on Linux, or a Linux package on Windows.** The two carry
  different compiled binaries, and a cross-built one fails at the moment you first unlock your
  vault — long after the build looked successful.
- Everything lands in `release/`.

### 3.B Arch Linux

Build it as above, then install the package you just made:

```bash
sudo pacman -U release/jadeite-1.1.0.pacman
```

**Via AUR** — not published yet. It is planned, but there is no `jadeite` in the AUR today,
and a command you could paste that would simply fail is worse than saying so.

### 3.C Windows

1. Download **`jadeite-1.1.0-setup.exe`** from the Releases page.
2. **Windows will show "Windows protected your PC".** This is expected. The installer is
   deliberately unsigned — a signing certificate is rented yearly, and this is an application
   whose whole point is that it never phones anybody. Click **More info → Run anyway**.
3. The installer asks where to put things rather than deciding for you; you can change the
   folder.
4. **No administrator password is needed.** It installs for your user only.
5. You get a Desktop and a Start-menu shortcut named **JADEITE**.
6. **Uninstalling does not delete your data.** Your vault stays in `%LOCALAPPDATA%\jadeite`
   and your settings in `%APPDATA%\jadeite`. Remove those by hand if you truly want them gone.

---

## 4. HOW TO USE? WHAT IS THE APPLICATION SECTIONS?

### Before anything else — the first run

The first time you open JADEITE it asks you to create a **master password**, and then shows
you a **recovery key, exactly once**. Write it down on paper before you continue.

> **If you forget your password *and* lose your recovery key, your vault cannot be opened.**
> Not by us, not by anyone. There is no back door and no reset — that is the point of it.

Only one recovery key is ever valid; changing your password issues a new one and retires the
old. Take a backup after any credential change. Dates read **GG/AA/YYYY** and money reads
**1.234,56 ₺**, in both languages.

### The sections

| Section | What it is for |
|---|---|
| **Gelir & Gider** — Income & Expenses | One workspace per year, twelve month rows under grouped income, expense and total columns. Sort and filter per column. Currencies never mix and there is no exchange rate anywhere. An empty cell means *nothing was entered*, which is not the same as zero. |
| **Ödemeler** — Payments | Deliberately has **no year** — one standing grid of the twelve months you are living in, for debts and instalments you hold *right now*. Banks are columns, with a credit limit above and remaining limit below. Paid or pending is worked out from today's date, never stored. |
| **Varlıklar** — Valuables | A lifetime ledger of acquisitions and disposals. Holdings are derived per person and per type, with cost basis taken oldest-lot-first against the current market value, so you see unrealised gain and loss. Built for keyboard entry. |
| **Hesap Alanı** — Calculation Zone | A plain grid of value boxes, ten to a row, for the month where you just need to add a lot of numbers. Total, average and median sit above and recompute as you type. No labels, no tags — just the figures. |
| **Genel Bakış** — Overview | Read-only. Every year as a card, headline tiles and trend charts, each figure derived from the sections and clickable through to wherever it came from. A tile with nothing to show says so rather than printing a misleading 0,00 ₺. |
| **Altın Eğrisi** | Three charts — spectrum, frequency and value — over your Valuables ledger. It is a *view*, not a store: there is no form here and no way to add a point by hand. Log scale, zoom, and filters per type and per person. |
| **Yedekleme** — Backup | Writes an encrypted `.jbk` container to a local folder you choose. The restore door is also on the lock screen and on the first-run screen, because the day you need it is the day your disk died. Importing replaces your local vault, after confirming. `Ctrl+B`. |
| **Ayarlar** — Settings | Ten colour palettes, switched instantly, and the Turkish/English choice. Both live outside the vault, which is how the lock screen already knows your colours and language before you have unlocked anything. |
| **Hakkında** — About | The mark, the maker, the version and release date, the source address and the licence in full. Addresses are text you can select but not click — the app opens no browser and follows no link, by design. |
| **Kilitle** — Lock | Locks immediately. It also locks itself when you have been idle, and wipes the key from memory when it does. |

### What it does with your data

Your vault is two files — `jadeite.db` and `jadeite.keys` — sealed with a random 256-bit key
that is wrapped twice under **Argon2id** over **SQLCipher / AES-256**. The *only* time JADEITE
uses the network at all is the optional live gold-price lookup in Valuables, which tells you
which source answered and simply goes quiet when you are offline. There is no telemetry, no
analytics, no crash reporting and no update check. Updates are something you choose to install.

---

## 5. LICENCE SUMMARY

JADEITE is free software under the **GNU General Public License, version 3 only**
(`GPL-3.0-only`).

In plain terms: you may use it for anything, study how it works, share it with anyone, and
change it to suit yourself. If you distribute a changed version, it must carry this same
licence so that whoever receives it has the freedoms you had. It comes with **no warranty**.

That is a summary and nothing more — the text that actually governs is the full
[`LICENSE`](LICENSE) file in this repository, and the same full text is readable inside the
application from the **Hakkında** page.

Copyright © sudo-megas · <https://github.com/sudo-megas/JADEITE>

*Built with Reason and Passion.*
