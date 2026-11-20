Option Explicit

Dim SapGuiAuto, application, connection, session
Dim noteNumber, action, transactionName, statusBar, statusMessage, popup

On Error Resume Next

If WScript.Arguments.Count <> 2 Then Fail "Parametros invalidos."
noteNumber = Trim(WScript.Arguments(0))
action = WScript.Arguments(1)
If Not IsNumeric(noteNumber) Or Len(noteNumber) > 12 Then Fail "Numero de nota invalido."
If action <> "close" And action <> "reopen" Then Fail "Acao de nota invalida."

Set SapGuiAuto = GetObject("SAPGUI")
CheckSapError "conectar ao SAP GUI"
Set application = SapGuiAuto.GetScriptingEngine
CheckSapError "acessar o mecanismo de scripting"
Set connection = application.Children(0)
CheckSapError "acessar a conexao SAP"
Set session = connection.Children(0)
CheckSapError "acessar a sessao SAP"

Set popup = FindControl("wnd[1]")
If Not popup Is Nothing Then Fail "Existe uma janela SAP aberta. Resolva-a antes de tentar novamente."
session.findById("wnd[0]").iconify
CheckSapError "minimizar a janela SAP"

session.findById("wnd[0]/tbar[0]/okcd").text = "/NIW22"
session.findById("wnd[0]").sendVKey 0
CheckSapError "abrir IW22"
WaitForSap
CheckSapStatus "abrir IW22"
Set popup = FindControl("wnd[1]")
If Not popup Is Nothing Then Fail "O SAP abriu uma janela inesperada ao acessar IW22."
session.findById("wnd[0]/usr/ctxtRIWO00-QMNUM").text = noteNumber
session.findById("wnd[0]").sendVKey 0
CheckSapError "abrir a nota " & noteNumber
WaitForSap
CheckSapStatus "abrir a nota " & noteNumber
Set popup = FindControl("wnd[1]")
If Not popup Is Nothing Then Fail "O SAP abriu uma janela inesperada ao abrir a nota."
If action = "close" Then
   session.findById("wnd[0]/tbar[1]/btn[16]").press
   CheckSapError "solicitar o encerramento"
   WaitForSap
   CheckSapStatus "solicitar o encerramento"
   Set popup = WaitForControl("wnd[1]/tbar[0]/btn[0]", 20)
   If popup Is Nothing Then Fail "O SAP nao exibiu a confirmacao de encerramento esperada. Verifique o status da nota antes de tentar novamente."
   popup.press
   CheckSapError "confirmar o encerramento"
   WaitForSap
Else
   session.findById("wnd[0]/tbar[1]/btn[18]").press
   CheckSapError "solicitar a reabertura"
   WaitForSap
End If
CheckSapStatus "alterar o status"
Set popup = FindControl("wnd[1]")
If Not popup Is Nothing Then Fail "O SAP exibiu uma janela inesperada. Verifique o status da nota antes de tentar novamente."
Set statusBar = session.findById("wnd[0]/sbar")
CheckSapError "verificar o resultado"
statusMessage = Trim(statusBar.Text)
CheckSapError "ler a mensagem de resultado"
If statusMessage = "" Or statusBar.MessageType <> "S" Then
   Fail "O SAP nao confirmou a alteracao de status. Verifique a nota antes de tentar novamente."
End If
CheckSapError "ler o tipo da mensagem de resultado"

If action = "close" Then
   session.findById("wnd[0]").sendVKey 12
   CheckSapError "retornar apos encerrar a nota"
Else
   session.findById("wnd[0]/tbar[0]/btn[3]").press
   CheckSapError "retornar apos reabrir a nota"
End If
WaitForSap
Set popup = FindControl("wnd[1]")
If Not popup Is Nothing Then Fail "O SAP solicitou uma confirmacao ao sair. Verifique a nota antes de tentar novamente."
CheckSapStatus "retornar da nota"
WScript.Echo statusMessage
WScript.Quit 0

Function FindControl(controlId)
   Dim control
   On Error Resume Next
   Set control = Nothing
   Err.Clear
   Set control = session.findById(controlId)
   If Err.Number = 0 And Not control Is Nothing Then
      Set FindControl = control
   Else
      Err.Clear
      Set FindControl = Nothing
   End If
End Function

Function WaitForControl(controlId, attempts)
   Dim attempt, control
   On Error Resume Next
   For attempt = 1 To attempts
      Set control = FindControl(controlId)
      If Not control Is Nothing Then
         Set WaitForControl = control
         Exit Function
      End If
      WScript.Sleep 250
   Next
   Set WaitForControl = Nothing
End Function

Sub WaitForSap()
   Dim attempt, isBusy
   On Error Resume Next
   For attempt = 1 To 200
      Err.Clear
      isBusy = session.Busy
      CheckSapError "aguardar o SAP"
      If Not isBusy Then Exit Sub
      WScript.Sleep 100
   Next
   Fail "O SAP excedeu o tempo de espera durante a alteracao de status."
End Sub

Sub CheckSapError(stepName)
   If Err.Number <> 0 Then
      Dim details
      On Error Resume Next
      details = Err.Description
      Err.Clear
      Fail "Falha ao " & stepName & ": " & details
   End If
End Sub

Sub CheckSapStatus(stepName)
   Dim bar
   On Error Resume Next
   Set bar = session.findById("wnd[0]/sbar")
   CheckSapError "consultar o status ao " & stepName
   If bar.MessageType = "E" Or bar.MessageType = "A" Then
      Fail "Falha ao " & stepName & ": " & bar.Text
   End If
End Sub

Sub Fail(message)
   WScript.StdErr.WriteLine message
   WScript.Quit 1
End Sub
