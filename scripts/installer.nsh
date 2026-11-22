; Sin esta regla, si nadie responde el aviso de Windows la app queda bloqueada en silencio y las
; teles no llegan. Se borra primero lo que hubiera con ese nombre, porque un bloqueo le gana a un
; permiso. Vale para cualquier perfil de red: muchas PC tienen la red marcada como pública.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="CEFLYRICS"'
  Pop $0
  ; Con este nombre quedaban bloqueos de cuando el programa se escribía con i.
  nsExec::Exec 'netsh advfirewall firewall delete rule name="CEFLIRICS"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall add rule name="CEFLYRICS" dir=in action=allow protocol=TCP profile=any enable=yes program="$INSTDIR\CEFLYRICS.exe"'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="CEFLYRICS"'
  Pop $0
  ; El acceso directo del escritorio lo crea la casilla del final: al desinstalar se borra, y al
  ; actualizar queda donde está.
  ${ifNot} ${isKeepShortcuts}
    WinShell::UninstShortcut "$oldDesktopLink"
    Delete "$oldDesktopLink"
  ${endIf}
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenido a CEFLYRICS"
  !define MUI_WELCOMEPAGE_TEXT "Versículos, letras, fotos, videos y temporizadores en el proyector, en las teles y en tu celular, sin necesidad de internet.$\r$\n$\r$\nEl programa ya trae todo lo que necesita: no hay que instalar nada más.$\r$\n$\r$\nTocá Siguiente para empezar."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; La página final de siempre, con una casilla más para el acceso directo del escritorio.
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function CreateDesktopLink
    CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Crear un acceso directo en el escritorio"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION "CreateDesktopLink"
  !insertmacro MUI_PAGE_FINISH
!macroend
