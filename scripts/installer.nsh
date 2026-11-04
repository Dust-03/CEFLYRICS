; Sin esta regla, si nadie responde el aviso de Windows la app queda bloqueada en silencio y las
; teles no llegan. Se borra primero lo que hubiera con ese nombre, porque un bloqueo le gana a un
; permiso. Vale para cualquier perfil de red: muchas PC tienen la red marcada como pública.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="CEFLIRICS"'
  Pop $0
  nsExec::Exec 'netsh advfirewall firewall add rule name="CEFLIRICS" dir=in action=allow protocol=TCP profile=any enable=yes program="$INSTDIR\CEFLIRICS.exe"'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="CEFLIRICS"'
  Pop $0
!macroend
