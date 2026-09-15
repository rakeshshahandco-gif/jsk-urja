#define MyAppName "JSK Extraction Agent"
#define MyAppPublisher "JSK URJA"
#define MyAppVersion "1.1.1"
#define MyAppExeName "staff-launcher.cmd"

[Setup]
AppId={{8C3E2A11-7B6F-4E1A-9C44-A1B2C3D4E5F6}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\JSK URJA\Extraction Agent
UsePreviousAppDir=yes
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=JSK-Extraction-Agent-Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayName={#MyAppName}
DisableWelcomePage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\windows\staff-launcher.cmd"; WorkingDir: "{app}"
Name: "{userprograms}\JSK URJA\{#MyAppName}"; Filename: "{app}\windows\staff-launcher.cmd"; WorkingDir: "{app}"
Name: "{userdesktop}\{#MyAppName}"; Filename: "{app}\windows\staff-launcher.cmd"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "JSK Extraction Agent"; ValueData: """{app}\windows\staff-launcher.cmd"""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\jskdiscovery"; ValueType: string; ValueName: ""; ValueData: "URL:JSK Extraction Agent"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\jskdiscovery"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\jskdiscovery\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\windows\staff-launcher.cmd"""
Root: HKCU; Subkey: "Software\Classes\jskextract"; ValueType: string; ValueName: ""; ValueData: "URL:JSK Extraction Agent"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\jskextract"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\jskextract\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\windows\staff-launcher.cmd"""

[Run]
Filename: "{app}\windows\staff-launcher.cmd"; Flags: nowait postinstall skipifsilent
