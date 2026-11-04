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
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenido a CEFLYRICS"
  !define MUI_WELCOMEPAGE_TEXT "Versículos, letras, fotos, videos y temporizadores en el proyector, en las teles y en tu celular, sin necesidad de internet.$\r$\n$\r$\nEl programa ya trae todo lo que necesita: no hay que instalar nada más.$\r$\n$\r$\nTocá Siguiente para empezar."
  !insertmacro MUI_PAGE_WELCOME
!macroend
