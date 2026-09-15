; Storm Solver — Inno Setup installer script
; Requires Inno Setup 6+ (https://jrsoftware.org/isinfo.php)

#define MyAppName "Storm Solver"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "JEFCON & ASSOCIATES"
#define MyAppExeName "main.exe"

[Setup]
AppId={{PUT-A-NEW-GUID-HERE}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Where the finished installer .exe is written to
OutputDir=installer_output
OutputBaseFilename=StormSolverSetup_{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Icon shown in Explorer/Start Menu for the installer + shortcuts (optional)
; SetupIconFile=app_icon.ico
; Require admin rights only if installing to Program Files (default here)
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
; Grabs EVERYTHING PyInstaller produced in the onedir build, recursively
Source: "dist\main\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs


[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; IconIndex: 0
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; IconIndex: 0; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Optional: also remove project data on uninstall. Leave commented out
; if you want user projects to survive an uninstall/reinstall.
; Type: filesandordirs; Name: "{userdocs}\Storm Engineering Suite"
