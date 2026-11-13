# installer/vendor

Drop third-party installers that the setup bundles here.

## Npcap (required for live packet capture on client machines)

Live traffic capture uses scapy, which needs the **Npcap** driver on the Windows
machine that runs the app. This is the usual reason capture "works on the dev
machine but not on a client PC" — the dev machine has Npcap, the client doesn't.

To make the setup install Npcap automatically:

1. Download the Npcap installer from **https://npcap.com**.
2. Save it in this folder. **Any `npcap*.exe` name works** — you can keep the
   downloaded name (e.g. `npcap-1.82.exe`) or rename it to `npcap-installer.exe`.
3. Build normally (`build.bat`). `installer/ews.iss` embeds whatever `npcap*.exe`
   is here, copies it to a temp folder, and runs it during setup **only when Npcap
   is not already present**, enabling WinPcap API-compatible mode and loopback support.

If no `npcap*.exe` is present the setup still compiles, but clients without Npcap
won't be able to run live capture — `build.bat` prints a warning in that case.

> Npcap's license does not permit fully silent redistribution, so its installer
> runs interactively during setup.

This folder is intentionally kept in git via this README; the `.exe` itself is
not committed.
