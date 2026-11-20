If WScript.Arguments.Count <> 2 Then
   WScript.Echo "Informe a pasta e o nome do arquivo de exportacao."
   WScript.Quit 1
End If

Sub WaitForSapSession()
   Dim startedAt
   startedAt = Timer
   Do While session.Busy
      If Timer < startedAt Then startedAt = startedAt - 86400
      If Timer - startedAt >= 60 Then
         Err.Raise vbObjectError + 513, "ITSS", "O SAP GUI excedeu o tempo de espera."
      End If
      WScript.Sleep 100
   Loop
End Sub

If Not IsObject(application) Then
   Set SapGuiAuto = GetObject("SAPGUI")
   Set application = SapGuiAuto.GetScriptingEngine
End If
If Not IsObject(connection) Then
   Set connection = application.Children(0)
End If
If Not IsObject(session) Then
   Set session = connection.Children(0)
End If
If IsObject(WScript) Then
   WScript.ConnectObject session, "on"
   WScript.ConnectObject application, "on"
End If
session.findById("wnd[0]").maximize
session.findById("wnd[0]/usr/cntlIMAGE_CONTAINER/shellcont/shell/shellcont[0]/shell").doubleClickNode "F00093"
WaitForSapSession
session.findById("wnd[0]/usr/cntlHTMLCONT/shellcont/shell").sapEvent "","","sapevent:/ITSSPM/RT0001"
WaitForSapSession
session.findById("wnd[0]/tbar[1]/btn[17]").press
WaitForSapSession
session.findById("wnd[1]/usr/cntlALV_CONTAINER_1/shellcont/shell").setCurrentCell 0,"TEXT"
session.findById("wnd[1]/usr/cntlALV_CONTAINER_1/shellcont/shell").selectedRows = "0"
session.findById("wnd[1]/usr/cntlALV_CONTAINER_1/shellcont/shell").doubleClickCurrentCell
WaitForSapSession
session.findById("wnd[0]/tbar[1]/btn[8]").press
WaitForSapSession
session.findById("wnd[0]/usr/cntlGRID1/shellcont/shell").currentCellRow = -1
session.findById("wnd[0]/usr/cntlGRID1/shellcont/shell").selectColumn "MATRICULA"
session.findById("wnd[0]/mbar/menu[0]/menu[3]/menu[2]").select
WaitForSapSession
session.findById("wnd[1]/usr/subSUBSCREEN_STEPLOOP:SAPLSPO5:0150/sub:SAPLSPO5:0150/radSPOPLI-SELFLAG[1,0]").select
session.findById("wnd[1]/usr/subSUBSCREEN_STEPLOOP:SAPLSPO5:0150/sub:SAPLSPO5:0150/radSPOPLI-SELFLAG[1,0]").setFocus
session.findById("wnd[1]/tbar[0]/btn[0]").press
WaitForSapSession
session.findById("wnd[1]/usr/ctxtDY_PATH").text = WScript.Arguments(0)
session.findById("wnd[1]/usr/ctxtDY_FILENAME").text = WScript.Arguments(1)
session.findById("wnd[1]/tbar[0]/btn[11]").press
WaitForSapSession
session.findById("wnd[0]").sendVKey 12
WaitForSapSession
session.findById("wnd[0]").sendVKey 12
WaitForSapSession
session.findById("wnd[0]").sendVKey 12
