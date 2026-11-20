; Instalador de Companion Explorer. Un acceso directo; el resto queda en una sola carpeta.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\dist\win-x64"
#endif

[Setup]
AppId={{A7B2E4C1-9D10-4F55-8C3A-1E6B0C9D4A21}
AppName=Companion Explorer
AppVersion={#AppVersion}
AppPublisher=Ian9Franco
DefaultDirName={localappdata}\Programs\Companion Explorer
DefaultGroupName=Companion Explorer
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=CompanionExplorer-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UninstallDisplayIcon={app}\CompanionExplorer.Host.exe

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Companion Explorer"; Filename: "{app}\CompanionExplorer.Host.exe"
Name: "{autodesktop}\Companion Explorer"; Filename: "{app}\CompanionExplorer.Host.exe"

[Run]
Filename: "{app}\CompanionExplorer.Host.exe"; Description: "Abrir Companion Explorer"; Flags: nowait postinstall skipifsilent