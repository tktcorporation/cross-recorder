; Cross Recorder NSIS Installer Script
;
; 背景: ZIP配布だとスタートメニュー登録やアンインストールが手動になるため、
; NSISでインストーラーを生成し、標準的なWindowsアプリ体験を提供する。
; release.yml の Windows ビルドステップから呼び出される。

!include "MUI2.nsh"
!include "FileFunc.nsh"

; --- 基本設定 ---
!define APP_NAME "Cross Recorder"
!define APP_EXE "Cross Recorder.exe"
!define APP_PUBLISHER "Cross Recorder"
!define APP_URL "https://github.com/tktcorporation/cross-recorder"

; VERSION と SOURCE_DIR はビルド時に /D オプションで渡される
; 例: makensis /DVERSION=0.9.0 /DSOURCE_DIR=path\to\build installer.nsi
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef SOURCE_DIR
  !define SOURCE_DIR "."
!endif

Name "${APP_NAME} ${VERSION}"
OutFile "CrossRecorder-${VERSION}-windows-x64-setup.exe"
InstallDir "$LOCALAPPDATA\${APP_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

; --- MUI 設定 ---
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "Japanese"
!insertmacro MUI_LANGUAGE "English"

; --- インストールセクション ---
Section "Install"
  SetOutPath "$INSTDIR"

  ; アプリケーションファイルを全てコピー
  File /r "${SOURCE_DIR}\*.*"

  ; アンインストーラーを作成
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; スタートメニューにショートカットを作成
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  ; デスクトップショートカット
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; レジストリにアンインストール情報を登録
  ; （「プログラムの追加と削除」に表示されるようにする）
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "URLInfoAbout" "${APP_URL}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayVersion" "${VERSION}"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "NoRepair" 1

  ; インストールサイズを計算して登録
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "EstimatedSize" $0

  ; インストール先をレジストリに保存（次回インストール時のデフォルト）
  WriteRegStr HKCU "Software\${APP_NAME}" "InstallDir" "$INSTDIR"
SectionEnd

; --- アンインストールセクション ---
Section "Uninstall"
  ; アプリケーションファイルを削除
  RMDir /r "$INSTDIR"

  ; スタートメニューのショートカットを削除
  RMDir /r "$SMPROGRAMS\${APP_NAME}"

  ; デスクトップショートカットを削除
  Delete "$DESKTOP\${APP_NAME}.lnk"

  ; レジストリからアンインストール情報を削除
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
  DeleteRegKey HKCU "Software\${APP_NAME}"
SectionEnd
