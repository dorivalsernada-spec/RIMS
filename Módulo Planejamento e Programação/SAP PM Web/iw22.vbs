Option Explicit

Dim SapGuiAuto, application, connection, session
Dim noteNumber, shortText, desiredStart, desiredCompletion
Dim priorityKey, shutdownValue, shutdownDuration, statusBar, shutdownField
Dim currentDescription, transactionName
Dim controlAttempt
Dim fieldId
Dim bulkMode

On Error Resume Next

If WScript.Arguments.Count <> 7 And WScript.Arguments.Count <> 8 Then
   Fail "A rotina IW22 recebeu parametros invalidos."
End If

noteNumber = Trim(WScript.Arguments(0))
shortText = WScript.Arguments(1)
desiredStart = WScript.Arguments(2)
desiredCompletion = WScript.Arguments(3)
priorityKey = WScript.Arguments(4)
shutdownValue = WScript.Arguments(5)
shutdownDuration = WScript.Arguments(6)
bulkMode = False
If WScript.Arguments.Count = 8 Then
   bulkMode = (WScript.Arguments(7) = "--bulk")
   If Not bulkMode Then
      Fail "A rotina IW22 recebeu um modo de execucao invalido."
   End If
End If

Set SapGuiAuto = GetObject("SAPGUI")
CheckSapError "conectar ao SAP GUI"
Set application = SapGuiAuto.GetScriptingEngine
CheckSapError "acessar o mecanismo de scripting"
Set connection = application.Children(0)
CheckSapError "acessar a conexao SAP"
Set session = connection.Children(0)
CheckSapError "acessar a sessao SAP"
session.findById("wnd[0]").iconify
CheckSapError "minimizar a janela SAP"

fieldId = "wnd[0]/usr/subSCREEN_1:SAPLIQS0:1050/subNOTIF_TYPE:SAPLIQS0:1051/txtVIQMEL-QMTXT"
transactionName = session.Info.Transaction
CheckSapError "identificar a transacao SAP aberta"
If UCase(transactionName) = "IW22" Then
   If bulkMode Then
      Fail "Para iniciar um ajuste em massa com seguranca, retorne ao SAP Easy Access e tente novamente."
   End If
   Set shutdownField = FindControl(fieldId)
   If shutdownField Is Nothing Then
      Fail "A transacao IW22 esta aberta, mas nenhuma nota em edicao foi identificada. Abra a nota " & noteNumber & " antes de tentar novamente."
   End If
   currentDescription = shutdownField.Text
   CheckSapError "confirmar a descricao da nota aberta"
   If currentDescription <> shortText Then
      Fail "A nota aberta no IW22 nao corresponde a descricao esperada para a nota " & noteNumber & ". Nenhum dado foi gravado."
   End If
Else
   session.findById("wnd[0]/tbar[0]/okcd").text = "IW22"
   session.findById("wnd[0]").sendVKey 0
   CheckSapError "abrir a transacao IW22"
   CheckSapStatus "abrir a transacao IW22"

   session.findById("wnd[0]/usr/ctxtRIWO00-QMNUM").text = noteNumber
   session.findById("wnd[0]").sendVKey 0
   CheckSapError "abrir a nota " & noteNumber
   CheckSapStatus "abrir a nota " & noteNumber
End If

session.findById("wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB01").select
CheckSapError "abrir a aba principal da nota"

session.findById(fieldId).text = shortText
session.findById("wnd[0]").sendVKey 0
CheckSapError "atualizar a descricao da nota"
CheckSapStatus "atualizar a descricao da nota"

If priorityKey <> "" Then
   fieldId = "wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB01/ssubSUB_GROUP_10:SAPLIQS0:7235/subCUSTOM_SCREEN:SAPLIQS0:7212/subSUBSCREEN_4:SAPLIQS0:7330/cmbVIQMEL-PRIOK"
   session.findById(fieldId).key = priorityKey
   session.findById(fieldId).setFocus
   session.findById("wnd[0]").sendVKey 0
   CheckSapError "atualizar a prioridade"
   CheckSapStatus "atualizar a prioridade"

   Call PressIfPresent("wnd[1]/usr/btnBUTTON_1", "confirmar a prioridade", 8)
End If

fieldId = "wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB01/ssubSUB_GROUP_10:SAPLIQS0:7235/subCUSTOM_SCREEN:SAPLIQS0:7212/subSUBSCREEN_4:SAPLIQS0:7330/ctxtVIQMEL-STRMN"
session.findById(fieldId).text = desiredStart
session.findById(fieldId).setFocus
session.findById("wnd[0]").sendVKey 0
CheckSapError "atualizar o inicio desejado"
CheckSapStatus "atualizar o inicio desejado"

fieldId = "wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB01/ssubSUB_GROUP_10:SAPLIQS0:7235/subCUSTOM_SCREEN:SAPLIQS0:7212/subSUBSCREEN_2:SAPLIQS0:7715/cntlTEXT/shellcont/shell"
session.findById(fieldId).setSelectionIndexes 0,0
CheckSapError "selecionar a tela da nota"

fieldId = "wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB01/ssubSUB_GROUP_10:SAPLIQS0:7235/subCUSTOM_SCREEN:SAPLIQS0:7212/subSUBSCREEN_4:SAPLIQS0:7330/ctxtVIQMEL-LTRMN"
session.findById(fieldId).text = desiredCompletion
session.findById(fieldId).setFocus
session.findById("wnd[0]").sendVKey 0
CheckSapError "atualizar a conclusao desejada"
CheckSapStatus "atualizar a conclusao desejada"

fieldId = "wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB01/ssubSUB_GROUP_10:SAPLIQS0:7235/subCUSTOM_SCREEN:SAPLIQS0:7212/subSUBSCREEN_2:SAPLIQS0:7715/cntlTEXT/shellcont/shell"
session.findById(fieldId).setSelectionIndexes 0,0
CheckSapError "selecionar a tela da nota"

fieldId = "wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB01/ssubSUB_GROUP_10:SAPLIQS0:7235/subCUSTOM_SCREEN:SAPLIQS0:7212/subSUBSCREEN_4:SAPLIQS0:7330/chkVIQMEL-MSAUS"
Set shutdownField = FindControl(fieldId)
If shutdownField Is Nothing Then
   Fail "O campo Parada nao foi encontrado na tela IW22."
End If
shutdownField.selected = (shutdownValue = "X")
CheckSapError "atualizar a indicacao de parada"

session.findById("wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB05").select
CheckSapError "abrir a aba de duracao da parada"
CheckSapStatus "abrir a aba de duracao da parada"
Call PressIfPresent("wnd[1]/tbar[0]/btn[0]", "confirmar a aba de duracao", 8)

fieldId = "wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB05/ssubSUB_GROUP_10:SAPLIQS0:7312/txtRIWO00-EAUSZT"
Set shutdownField = Nothing
For controlAttempt = 1 To 20
   Set shutdownField = FindControl(fieldId)
   If Not shutdownField Is Nothing Then Exit For
   WScript.Sleep 250
Next
If shutdownField Is Nothing Then
   Fail "O campo de duracao da parada nao ficou disponivel na aba de avaria."
End If
Err.Clear
shutdownField.text = shutdownDuration
CheckSapError "atualizar a duracao da parada"
If Trim(shutdownField.Text) <> Trim(shutdownDuration) Then
   Fail "O SAP nao manteve o valor informado para a duracao da parada."
End If

session.findById("wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB01").select
CheckSapError "voltar a tela principal da nota"
fieldId = "wnd[0]/usr/tabsTAB_GROUP_10/tabp10\TAB01/ssubSUB_GROUP_10:SAPLIQS0:7235/subCUSTOM_SCREEN:SAPLIQS0:7212/subSUBSCREEN_2:SAPLIQS0:7715/cntlTEXT/shellcont/shell"
session.findById(fieldId).setSelectionIndexes 0,0
CheckSapError "preparar a gravacao da nota"

session.findById("wnd[0]/tbar[0]/btn[11]").press
CheckSapError "gravar a nota no SAP"
CheckSapStatus "gravar a nota no SAP"
Set statusBar = session.findById("wnd[0]/sbar")
CheckSapError "verificar o resultado da gravacao"
If Trim(statusBar.Text) = "" Or statusBar.MessageType <> "S" Then
   Fail "O SAP nao retornou uma mensagem de sucesso apos gravar. Verifique a nota antes de tentar novamente."
End If
WScript.Echo statusBar.Text
session.findById("wnd[0]/tbar[0]/btn[3]").press
CheckSapError "retornar da nota"
WScript.Quit 0

Function FindControl(controlId)
   Dim control
   Err.Clear
   Set control = session.findById(controlId)
   If Err.Number = 0 Then
      Set FindControl = control
   Else
      Err.Clear
      Set FindControl = Nothing
   End If
End Function

Function PressIfPresent(controlId, stepName, attempts)
   Dim control, attempt, lastError
   For attempt = 1 To attempts
      Set control = FindControl(controlId)
      If Not control Is Nothing Then
         Err.Clear
         session.findById("wnd[0]").iconify
         CheckSapError "manter a janela SAP minimizada"
         control.press
         If Err.Number = 0 Then
            PressIfPresent = True
            Exit Function
         End If
         lastError = Err.Description
         Err.Clear
         Set control = FindControl(controlId)
         If control Is Nothing Then
            PressIfPresent = True
            Exit Function
         End If
      End If
      WScript.Sleep 250
   Next
   If lastError <> "" Then
      Fail "Falha ao " & stepName & ": " & lastError
   End If
   PressIfPresent = False
End Function

Sub CheckSapError(stepName)
   If Err.Number <> 0 Then
      Dim details
      details = Err.Description
      Err.Clear
      WScript.StdErr.WriteLine "Falha ao " & stepName & ": " & details
      WScript.Quit 1
   End If
End Sub

Sub CheckSapStatus(stepName)
   Dim currentStatus
   Set currentStatus = session.findById("wnd[0]/sbar")
   CheckSapError "consultar o status SAP"
   If currentStatus.MessageType = "E" Or currentStatus.MessageType = "A" Then
      Fail "O SAP recusou a operacao ao " & stepName & ": " & currentStatus.Text
   End If
End Sub

Sub Fail(message)
   WScript.StdErr.WriteLine message
   WScript.Quit 1
End Sub
