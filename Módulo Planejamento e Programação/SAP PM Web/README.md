# RIMS One

Servidor local de acesso ao Planejamento SAP PM e ao Gerenciamento de Parada.

## Acesso

1. Abra o SAP GUI e conecte-se ao ambiente correto.
2. Execute `iniciar.bat` nesta pasta.
3. Na primeira execução, crie a conta administrativa no terminal. A senha é
   solicitada sem aparecer na tela e deve ter pelo menos 12 caracteres.
4. Acesse <http://127.0.0.1:8765/login> e entre com a conta criada.
5. Após autenticar, escolha **Gerenciamento de Parada** ou
   **Planejamento e Programação**. A raiz
   <http://127.0.0.1:8765/> e as respectivas APIs também exigem sessão.
6. No Planejamento SAP PM, acesse o painel de
   gráficos em <http://127.0.0.1:8765/dashboard>; use **Painel de notas** para
   voltar à tabela original. O Gantt semanal está em
   <http://127.0.0.1:8765/gantt>; navegue entre os painéis pela faixa de abas
   abaixo do cabeçalho. Ao passar o mouse sobre a barra lateral de ícones,
   um painel exibe opções ilustrativas, que ainda não possuem ações.
   No Gantt, arraste a barra para mover as datas ou use suas extremidades para
   aumentar/reduzir o período. A barra fica cinza enquanto há alterações
   pendentes. Dê dois cliques nela para editar prioridade, datas, duração da
   parada e indicação de parada; nota, denominações, descrição e executor são
   somente leitura. **Alterar Dados** grava os campos permitidos no SAP via
   IW22 e restaura a cor condicional da barra quando o SAP confirmar; **Cancelar
   Ação** descarta as alterações pendentes. Fechar a janela apenas a fecha.
   Os botões **Encerrar** e **Reabrir** atuam na nota selecionada via IW22,
   após confirmação. A primeira sessão SAP pode estar em qualquer transação,
   mas sem janelas (pop-ups) abertas nem dados não salvos. Esses comandos não gravam nem descartam as edições
   pendentes do Gantt. Após a confirmação de encerramento ou reabertura, o botão
   **SAP (IW28)** é acionado automaticamente para atualizar o status exibido,
   mantendo o SAP minimizado para preservar a visualização da página; se houver
   erro ou confirmação incerta, confira a nota no SAP antes de tentar novamente.
   Ao gravar, encerrar ou reabrir pelo Gantt, a janela do SAP é minimizada
   durante o scripting.
7. Selecione uma exportação, pesquise os registros e use **Ajustar** para
   ajustar executante, prioridade, início e conclusão desejados, duração,
   indicação de parada e descrição. Ao salvar, confirme a gravação no SAP.
8. Marque uma ou mais linhas pela bandeira e use **Ajuste em Massa** ao lado
   dos filtros para aplicar os valores do formulário a todas as notas marcadas.
   As gravações são sequenciais; em caso de falha, o processo para na primeira
   nota não confirmada e mantém essa nota e as seguintes marcadas. Para iniciar
   uma gravação em massa com segurança, deixe o SAP na tela Easy Access.
9. Use **Exportar planejamento** para baixar a lista ajustada em CSV.
10. Para consultar colunas fora da área visível, use a barra horizontal acima
   da tabela; ela acompanha a rolagem da própria tabela.
11. Filtre a lista por centro de trabalho, tipo de nota, parada, datas desejadas,
   executante, status do sistema ou prioridade. Cada filtro permite selecionar
   várias opções; use a bandeira antes de **CenTrabRes** para marcar linhas.

## Arquivos e atualizações

A aplicação reconhece as exportações `SAP GUI\IW28.txt`, `SAP GUI\TESTE.txt` e
`teste 1`, existentes na pasta SAP ao lado desta aplicação. Os ajustes são
mantidos localmente em `planejamento.json` e não alteram o arquivo exportado
original. Executante e os campos de planejamento local ficam somente no painel;
a descrição, as datas desejadas, a prioridade e os campos de parada são enviados
à nota IW28 selecionada por scripting IW22. A exportação CSV inclui os valores
originais e os ajustes locais.

O scripting IW22 utiliza as chaves de prioridade configuradas: Alta = 2,
Média = 3 e Baixa = 4. A prioridade é aplicada antes das datas desejadas para
evitar que o recálculo automático do SAP substitua o início informado. Antes
de salvar, confira a confirmação que mostra o número da nota e os valores
enviados. Se o SAP não confirmar a gravação, o ajuste local permanece salvo;
verifique a nota no IW22 antes de tentar novamente. A sessão SAP GUI deve estar
aberta e conectada.

O botão **SAP (IW28)** está disponível em todos os painéis, com o percentual
estimado de progresso no centro de um indicador circular animado;
ao concluir, o painel aberto recarrega os registros. No Gantt, a atualização
manual ou automática mantém o SAP minimizado para preservar a página visível.
No painel de nivelamento, **Carregar tabela Disp** seleciona a planilha de disponibilidade.
O botão **Atualizar SAP** junto à disponibilidade executa a mesma atualização
IW28 do cabeçalho; ele não envia as programações locais ao SAP nem recarrega a
planilha de disponibilidade a partir do Excel.
Na planilha `Disponibilidade Funcionários_Safra_2026`, a aba `LIST_FUN` possui
campos de funcionário, área, equipe, quantidade, matrícula, função, centro,
setores, especialidade, rendimento, status, férias, treinamento, horas, banco
de horas e turno, além de totais semanais e disponibilidades por data. As abas
`FERIADOS` e `SEMANA` dão suporte às fórmulas da planilha. A aplicação lê os
valores calculados e salvos na aba principal; não recalcula fórmulas do Excel.
A tabela de disponibilidade usa os nomes e centros da planilha. Para cada dia
da semana selecionada, D mostra horas disponíveis e P soma a DuraçParad das
notas PEN, AND e ENC atribuídas ao funcionário e centro correspondentes,
distribuindo a duração igualmente entre todos os dias do período da nota.
Notas sem correspondência não entram em P. Traço em D indica
que não há dado para aquela data; arquivos carregados antes desta versão podem
precisar ser carregados novamente para mostrar dias sem horas.
O gráfico semanal abaixo das tabelas mostra os totais de HH disponível,
programado e realizado; nele o programado inclui notas mesmo sem executor
correspondente, ao contrário da coluna P da tabela de funcionários.
Para programar uma nota sem denominação de executor, arraste sua DuraçParad
para a célula P do funcionário e dia desejados. Também é possível selecionar
a duração e clicar na célula P. A duração inteira é lançada no dia escolhido;
arrastar novamente move a programação e o botão × ao lado da duração a remove.
A célula DuraçParad e a célula P ficam amarelas enquanto contêm programação
local. Para estornar uma nota específica, dê dois cliques na célula P (ou
selecione-a com o teclado e pressione Enter ou Espaço) e escolha **Estornar**
na lista. Outras notas na mesma célula e as horas vindas do SAP são preservadas.
A programação é salva somente no navegador deste computador, não no SAP,
e permanece na tabela de notas enquanto a nota não tiver executor no SAP.
A coluna **Denominação executor**, após **Descrição**, mostra o funcionário
da programação local; ela é atualizada ao mover ou estornar a nota. O nome
pode ser filtrado e não altera o valor original no SAP.
Notas sem número único ou duração positiva não podem ser programadas assim.
O gráfico e os totais usam o dia e centro da programação local para essas notas.
Não há bloqueio por disponibilidade insuficiente ou ausente.
Ao lado da disponibilidade, a tabela exibe notas IW28 com o campo original
**Denominação executor** vazio e status AND ou PEN. O filtro de centro de
trabalho aplica-se às duas tabelas; a semana selecionada não filtra as notas sem executor.
O resumo da tabela mostra a quantidade de notas exibidas e **Qtd HH**, soma
de DuraçParad das notas exibidas após os filtros.
O filtro **Funcionário** afeta as duas tabelas, o gráfico e os indicadores.
Com funcionários selecionados, notas sem funcionário correspondente ficam
ocultas; as programações locais são consideradas como atribuições. **Todos**
restaura a visualização sem filtro de funcionário. As opções respeitam o
centro selecionado, e escolhas existentes são mantidas ao mudar de centro.
Use **Filtros** para escolher um campo visível, buscar e selecionar um ou mais
valores; seleções em campos diferentes são combinadas. **Aplicar** confirma,
**Cancelar** descarta e **Limpar todos** limpa as seleções da janela antes de
aplicar. Valores vazios aparecem como **(Sem valor)**. Use **Campos visíveis**
para escolher as colunas; a seleção é salva no navegador. Ao ocultar uma
coluna, seu filtro é limpo.
Use a seta junto ao cabeçalho para ordenar uma coluna em ordem crescente ou
decrescente; datas e durações são comparadas por valor, e campos vazios ficam
ao final. A ordenação é desativada ao ocultar a coluna correspondente.
As linhas da tabela de notas têm altura fixa; passe o mouse sobre uma célula
para consultar o valor completo quando ele estiver abreviado.
Como no painel de notas, AND sem parada é exibido como PEN, e valores locais
de prioridade, descrição e duração substituem os originais quando disponíveis.
O botão **Atualizar arquivo SAP (IW28)** executa `iw28.vbs` no SAP GUI e consulta
a lista. Ao salvar o formulário **Ajustar**, `iw22.vbs` abre a nota selecionada
e grava no SAP a descrição, datas desejadas, prioridade, parada e duração. O
executante permanece somente no planejamento local. Confira os valores na
confirmação antes de autorizar a gravação. Quando a exportação IW28 termina
com sucesso, a página recarrega automaticamente os registros, cards, resultados
e data do arquivo.

O serviço atende somente em `127.0.0.1:8765`. Encerre-o fechando a janela do
terminal.

No painel de confiabilidade, o botão **SAP (ITSS)**, ao lado de **SAP (IW28)**, executa o script ITSS na
primeira sessão SAP GUI. Deixe a sessão na tela inicial Easy Access e a variante
esperada disponível; o script aguarda o SAP concluir cada navegação antes de
continuar. O progresso é estimado; uma falha é exibida no painel.
A exportação é salva em `SAP GUI\ITSS_Rotas.txt` e pode ser consumida como
texto UTF-8 em `/api/itss/export`. A exportação anterior é preservada caso o
script falhe ou o arquivo não tenha o cabeçalho e registros esperados. IW28,
ITSS e as gravações IW22 não são executados simultaneamente.

## Dashboard

O painel em `/dashboard` usa a exportação IW28 e os ajustes locais salvos para
agrupar notas por tipo (B1/B2/B3), prioridade, local de instalação, executante
e centro de trabalho. Notas com status de sistema exatamente `MREL MSEN ORDA`
não são incluídas nos cartões nem nos gráficos do dashboard. Os filtros
**Notas Abertas**, **Notas Programadas** e
**Em Andamento** podem ser combinados e iniciam selecionados. A seleção limita
os registros usados pelos gráficos; se nenhum filtro estiver selecionado, os
gráficos mostram zero registros. Clique em uma categoria de qualquer gráfico
para filtrar os demais gráficos; é possível combinar categorias de gráficos
diferentes e usar **Limpar seleções** para reiniciar. O gráfico selecionado
mantém suas opções disponíveis para continuar a navegação. Notas programadas
são as que têm ordem numérica maior que 10; notas em andamento são as que têm
Parada marcada.

## Kanban

O painel em `/kanban` organiza as notas da exportação IW28 em quatro colunas:
**Notas Programadas** (amarela; ordem maior que 10, sem estar em andamento ou
encerrada), **Notas Em Andamento** (azul; status AND ou PEN com Parada = X),
**Notas Encerradas** (verde; status ENC) e **Notas Prioridade Alta** (vermelho
claro; prioridade Alta, exceto encerradas). Uma nota pode aparecer em mais de
uma coluna. Os filtros de **Centro de trabalho**, **Semana** e **Executor**
permitem seleção múltipla; centro e executor são guardados no navegador, e a
semana atual vem sempre selecionada ao abrir a aba. A semana filtra notas
cujo período (início/conclusão desejada) cruza a semana escolhida.

## Gantt semanal

O painel em `/gantt` apresenta somente notas programadas (ordem numérica maior
que 10), exceto as com status de sistema exatamente `MREL MSEN ORDA`, como
tarefas numa linha do tempo semanal. Cada tarefa mostra executor,
local de instalação, denominação do local, ordem e duração. Ao selecionar ou
remover centros de trabalho, todos os executores disponíveis para a seleção
atual ficam selecionados. As barras não têm
texto interno; ao passar o mouse ou focar uma barra, são exibidos executor,
início da necessidade, conclusão desejada, duração e status. No Gantt, tarefas
com status **AND** e sem `X` na coluna **Parada** são exibidas como **PEN**;
com `X`, permanecem como **AND**. As datas do
planejamento local têm preferência; quando não existem, são usadas as datas da
exportação IW28. Tarefas com datas ficam visíveis nas semanas em que ocorrem;
ordens sem datas continuam listadas, identificadas como sem data programada.
A tabela é ordenada em ordem crescente pelo executor e, dentro de cada executor,
pelo início desejado; tarefas sem início ficam depois das tarefas com data.
A barra do Gantt exibe a duração da coluna **Duração** com `h` ao final. A
tabela inclui **Descrição** e apresenta o **Local** com o código posicional da
instalação, por exemplo `FAC` em `UPE-FAC-TCA-AQC-REGA-RGCALAC01`. O filtro **Centro de
trabalho**, ao lado do botão Anterior, limita as tarefas da semana ao centro
selecionado. O filtro **Parada** permite listar todas as notas, somente notas
com parada ou notas sem parada. Há uma separação visual entre a tabela e o
gráfico do Gantt, com uma faixa de sete dias. Em telas estreitas, use a barra horizontal do painel para
acessar todas as colunas e o cronograma. A semana exibida e os filtros de centro de trabalho, parada
e status são salvos no navegador e restaurados ao voltar à página.

## Confiabilidade

O rodapé do painel reúne as instruções dos pontos de controle, os dados da
tabela de códigos e da planilha de rotas e o link para baixar a planilha.

O botão **XLS (ROTAS)** carrega uma planilha `.xlsx` de até 10 MB com as colunas
**CÓDIGO**, **TÉCNICA**, **TIPO** e datas de inspeção após a coluna **CÓDIGO**,
marcadas com `X`. A
planilha original é guardada localmente e pode ser baixada novamente. Os botões
**Lubrificação**, **Check List** e **Preditiva** classificam os pontos pela
situação das rotas da semana da **Data atual** selecionada previstas até essa data: vermelho se alguma
estiver sem registro de realização, cinza para registro `Parado` ou avaliação
indisponível e verde quando todas tiverem apenas registros `Insp`. Se houver
resultados mistos, prevalecem vermelho, depois cinza e depois verde. Pontos
sem rota prevista até a data selecionada nessa semana ficam cinza. O filtro usa o **TIPO**:
`YB20` para Lubrificação, `YBA9` para Check List e `YB10` para Preditiva.
A associação usa o código atribuído ao ponto no painel e o tipo, reunindo as
datas de linhas com o mesmo código e tipo, independentemente do texto de
**TÉCNICA**. Linhas sem o tipo correspondente não entram no filtro; pontos
sem código não são associados. Ao passar sobre o ponto, são exibidas as duas
últimas datas anteriores à semana selecionada, todas as datas dessa semana e as
duas próximas datas posteriores, quando disponíveis. Ao lado de cada data prevista,
as datas realizadas na mesma semana para os TAGs e tipo previstos naquela
data: `Insp` em verde para status `S` e `Parado` em cinza para status `N`.
Ausência de registro é indicada em vermelho. Sem registros ou
quando a associação não está disponível, isso é indicado para datas previstas
até a data selecionada. Datas posteriores são exibidas sem avaliação. Os registros são associados pelo
**TAG** e **TIPO** da planilha de rotas ao trecho anterior a `_` na descrição
da atividade e ao tipo de ordem do ITSS. O status `S` indica inspeção realizada;
`N`, inspeção realizada com equipamento parado.
O detalhe também mostra a última inspeção realizada até a data selecionada para a técnica,
com data, nome e status; se houver várias na mesma data, mostra todas.
Essa informação histórica não altera a avaliação da semana selecionada.
Para cada TAG com rota prevista na semana selecionada até a data de referência, a avaliação no detalhe
compara a semana da data planejada com a **Data** do ITSS de mesmo TAG e
tipo. Status `S` ou `N` contam como realizada; sem esses registros na mesma
semana, a rota é apresentada como sem registro de realização. Sem TAG ou com
ITSS indisponível, a avaliação é informada como indisponível.
Ao dar dois cliques no rótulo de um ponto, o resumo oferece **Histórico de
Rotas**, uma tabela com todas as datas previstas no ano da data selecionada para a técnica
selecionada nos botões do painel e os respectivos resultados, seguindo as
mesmas regras do detalhe, em colunas separadas para data prevista, data
realizada e situação. É necessário selecionar uma técnica antes de abrir
esse histórico.
TAG ou TIPO ausente é informado no painel. O indicador de **XLS (ROTAS)**
mostra o progresso real do envio e conclui em 100% após o servidor validar e
processar o arquivo. Arquivos antigos `.xls` devem ser salvos no Excel como
`.xlsx` antes do carregamento.

O fundo ao redor da imagem do layout permanece branco, inclusive em tela inteira.
Os botões de visualização ficam abaixo da imagem, inclusive em tela inteira, e
alternam os pontos entre **Ocorrências** (estados
atuais das notas) e **Saúde do Ativo**. Na saúde, a confiabilidade calculada
para a safra determina a cor: verde para valores a partir de 70%, amarelo de
50% até menos de 70% e vermelho abaixo de 50%. Pontos sem cálculo disponível,
incluindo quando a leitura IW28 falha, aparecem em cinza. Os botões de inspeção
usam as marcações `X` das colunas de datas na planilha XLS (ROTAS).
Em **Ocorrências**, notas abertas (PEN ou AND) do TAG ou dos locais
subordinados deixam o ponto vermelho se alguma tiver prioridade Alta e amarelo
caso contrário. Sem notas abertas, o ponto fica verde. Uma chave cinza junto
ao ponto indica que alguma nota aberta tem `X` em **Parada**, sem substituir a
cor da prioridade. Notas encerradas não afetam esses indicadores; quando as
notas IW28 ou o TAG não estão disponíveis, o ponto fica cinza.

O botão **WhatsApp**, ao lado de **Data atual**, abre o cadastro de contatos e
as opções de mensagem. Os contatos são guardados no armazenamento local do
navegador; informe o telefone com DDI e DDD. Selecione os destinatários e uma
ou mais listas, confira a pré-visualização e clique em **Enviar** para abrir as
conversas selecionadas no WhatsApp com a mensagem preenchida. Confirme o envio
em cada conversa no WhatsApp; o painel não envia mensagens automaticamente nem
confirma sua entrega. Se o navegador bloquear a abertura, use os links exibidos.
Para mensagens muito longas, copie a pré-visualização e cole-a nas conversas
abertas.

As listas se limitam aos TAGs associados aos pontos da área selecionada e aos
seus locais subordinados. **Conjuntos em Alarmes** inclui notas atualmente
abertas (PEN ou AND); **Serviços Programados** inclui notas abertas com ordem
numérica maior que 10 e período que cruza a semana da data de referência,
usando os ajustes de planejamento quando disponíveis. Serviços sem data válida
são informados separadamente. **Ativos com Baixa Confiabilidade** inclui pontos
com CONF calculada inferior a 70% e informa quantos pontos não puderam ser
avaliados. As listas informam pontos sem TAG; a geração exige notas IW28
disponíveis e, para confiabilidade, uma safra válida.
Ao passar o mouse sobre um ponto, o painel mostra a denominação do local de
instalação encontrada nas notas IW28 com o mesmo TAG; se não houver uma
denominação correspondente, exibe "Não disponível". Na visualização **Saúde
do Ativo**, também apresenta um texto com a última nota ENC criada no período,
tempos decorrido e restante, paradas, MTTR, MTBF, disponibilidade e
confiabilidade. Valores não calculáveis são identificados como indisponíveis,
com a respectiva explicação.

Informe **Início de safra** e **Fim de safra** para calcular os indicadores dos
pontos de controle. O campo **Data atual** inicia com a data local atual ao abrir a
página e define a referência para os cálculos de safra e inspeções. Para cálculos
que exigem horário, combina-se a data selecionada com o horário atual do
computador. O fim deve ser posterior ao início e o instante de referência deve
estar dentro da safra; fora dela os indicadores ficam indisponíveis. O tempo
observado vai do início até o instante de referência e o tempo de missão vai
desse instante até o fim. São consideradas as notas atualmente ENC do TAG e dos
locais subordinados cuja data **Criado em** esteja entre o início e a data
selecionada, inclusive.
Como a exportação não informa o horário de criação, os dias-limite são
considerados integralmente; notas sem data válida não entram no cálculo.
O histórico de notas ENC continua exibindo todas as notas. Como a exportação
contém apenas o status atual das notas, a data selecionada não reconstrói o
status histórico em **Ocorrências** ou nos indicadores de safra.

Na janela de resumo do ponto, **Paradas** contabiliza todas as notas ENC do
histórico do TAG e dos locais subordinados, inclusive fora da safra e sem
duração de parada. A contagem fica indisponível se o TAG ou as notas IW28
estiverem indisponíveis. Os demais indicadores continuam restritos à safra.

Para os cálculos de confiabilidade, cada nota da safra com duração de parada
maior que zero conta como uma parada:

- MTTR = horas de parada / número de paradas.
- MTBF = (horas decorridas desde o início - horas de parada) / número de paradas.
- Disponibilidade = MTBF / (MTBF + MTTR).
- Confiabilidade = exp(-horas restantes até o fim da safra / MTBF), sob a
  hipótese de taxa de falha constante. O MTTR é usado na disponibilidade;
  o tempo de parada também integra o cálculo do MTBF.

Quando o total de horas de parada excede o tempo decorrido, o painel informa
a inconsistência e não calcula MTBF, disponibilidade nem confiabilidade.
Sem notas no período, os indicadores ficam indisponíveis. Se houver notas,
mas nenhuma parada registrada, MTTR e MTBF ficam indisponíveis, enquanto
disponibilidade e confiabilidade são exibidas como 100%.
