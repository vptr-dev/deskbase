; Included by electron-builder in the installer and uninstaller.

; No "Deskbase x.y.z" text on the bottom line.
!macro customHeader
  BrandingText " "
!macroend

; Always install for the current user (updates need no admin), so skip the "who for" page.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; Welcome page with the sidebar artwork (build/installerSidebar.bmp).
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Install Deskbase"
  !define MUI_WELCOMEPAGE_TEXT "Deskbase puts your pages, tasks and notes on the desktop as panels that sit under your windows.$\r$\n$\r$\nIt installs for your Windows account only and updates itself.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend
