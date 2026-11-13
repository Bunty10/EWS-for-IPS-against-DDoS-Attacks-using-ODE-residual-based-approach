; Inno Setup script for Residual-based ODE EWS IPS.
;
; Packages the PyInstaller one-folder output (dist\Residual-based-ODE-EWS-IPS\) into a Windows
; installer in installer_output\. Requires the Inno Setup compiler (ISCC.exe):
;   https://jrsoftware.org/isdl.php   or   choco install innosetup
; Build (from the repo root, after PyInstaller has produced the app folder):
;   ISCC installer\ews.iss
;
; ── Installing multiple versions on one machine ─────────────────────────────
; An app's identity is its AppId. You can give ANY unique string (a GUID is the
; usual choice, but not required) — two installers with the SAME AppId are treated
; as the same app (a new one upgrades/replaces the old), while DIFFERENT AppIds
; install as separate apps that coexist.
;
;   SideBySide = 1 (default): the version is folded into the AppId, install folder,
;       Start-menu group and setup file name, so each version installs ALONGSIDE the
;       others — its own entry in Add/Remove Programs, its own uninstaller, and (via
;       backend/dlt/paths.py) its own data folder.
;   SideBySide = 0: a fixed AppId/folder, so a newer build UPGRADES the previous one.
;
; Set the version and mode at build time without editing this file:
;   ISCC /DAppVersion=1.1.0 installer\ews.iss                 (side-by-side v1.1.0)
;   ISCC /DAppVersion=1.1.0 /DSideBySide=0 installer\ews.iss  (upgrade in place)

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef SideBySide
  #define SideBySide 1
#endif

#define AppBaseName "Residual-based ODE EWS IPS"
#define AppPublisher "Residual-based ODE EWS IPS"
; The PyInstaller payload folder + exe (produced by ews.spec; not version-suffixed).
#define AppFolder "Residual-based-ODE-EWS-IPS"
#define AppExeName "Residual-based-ODE-EWS-IPS.exe"

#if SideBySide
  #define AppName AppBaseName + " " + AppVersion
  #define InstallFolder "Residual-based-ODE-EWS-IPS-" + AppVersion
  #define AppIdValue "Residual-based-ODE-EWS-IPS-" + AppVersion
#else
  #define AppName AppBaseName
  #define InstallFolder "Residual-based-ODE-EWS-IPS"
  #define AppIdValue "Residual-based-ODE-EWS-IPS"
#endif

[Setup]
; AppId is the install identity (see the note above). Any unique string works.
AppId={#AppIdValue}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\{#InstallFolder}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Install for all users → requires admin (also matches the app's admin runtime).
PrivilegesRequired=admin
OutputDir=..\installer_output
OutputBaseFilename={#InstallFolder}-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\packaging\icon.ico
UninstallDisplayIcon={app}\{#AppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
; The entire PyInstaller one-folder output.
Source: "..\dist\{#AppFolder}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
; Ship the SMTP template (.env.example) so admins can create a .env if they wish.
; skipifsourcedoesntexist keeps the build working even if the file is absent.
Source: "..\backend\.env.example"; DestDir: "{app}"; Flags: onlyifdoesntexist skipifsourcedoesntexist
; Bundle the Npcap installer (required for live packet capture). Drop ANY Npcap
; installer in installer\vendor\ (e.g. npcap-1.82.exe or npcap-installer.exe) — the
; wildcard embeds whatever is there, and [Code] below runs it when Npcap is missing.
; skipifsourcedoesntexist keeps the setup compiling for maintainers who build without it.
Source: "vendor\npcap*.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall skipifsourcedoesntexist; Check: NpcapMissing

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
; Install Npcap first so live packet capture works on client machines that don't
; have it. /winpcap_mode=yes is what scapy needs; the free Npcap installer shows its
; UI (its license does not permit fully silent redistribution), so the user clicks
; through once. Runs only when Npcap is missing AND an installer was bundled.
Filename: "{code:NpcapInstallerPath}"; Parameters: "/winpcap_mode=yes /loopback_support=yes"; StatusMsg: "Installing Npcap (required for live packet capture)..."; Flags: waituntilterminated skipifdoesntexist; Check: NpcapShouldRun
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
{ Detect an existing Npcap / WinPcap install so we don't reinstall it. Npcap's
  runtime library is wpcap.dll, installed either under System32\Npcap or System32. }
function NpcapInstalled: Boolean;
begin
  Result := FileExists(ExpandConstant('{sys}\Npcap\wpcap.dll')) or
            FileExists(ExpandConstant('{sys}\wpcap.dll'));
end;

function NpcapMissing: Boolean;
begin
  Result := not NpcapInstalled;
end;

var
  CachedNpcapExe: String;
  CachedNpcapChecked: Boolean;

// Full path of the Npcap installer that was extracted to the temp dir (any
// npcap*.exe), or '' if none was bundled. Cached so it is resolved once.
function NpcapInstallerPath(Param: String): String;
var
  FindRec: TFindRec;
begin
  if not CachedNpcapChecked then
  begin
    CachedNpcapChecked := True;
    CachedNpcapExe := '';
    if FindFirst(ExpandConstant('{tmp}\npcap*.exe'), FindRec) then
    begin
      try
        CachedNpcapExe := ExpandConstant('{tmp}\') + FindRec.Name;
      finally
        FindClose(FindRec);
      end;
    end;
  end;
  Result := CachedNpcapExe;
end;

function NpcapShouldRun: Boolean;
begin
  Result := NpcapMissing and (NpcapInstallerPath('') <> '');
end;
