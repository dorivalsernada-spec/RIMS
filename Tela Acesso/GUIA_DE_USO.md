# RIMS One — acesso aos módulos

## Iniciar e entrar

1. Abra o SAP GUI e conecte-se ao ambiente correto.
2. Execute `iniciar.bat` em `Módulo Planejamento e Programação\SAP PM Web`.
3. Na primeira execução, crie a conta administrativa no terminal. Use uma
   senha com pelo menos 12 caracteres; ela não será exibida enquanto digitada.
4. Acesse <http://127.0.0.1:8765/login> e entre com essa conta.
5. Escolha **Gerenciamento de Parada** ou **Planejamento e Programação**. A
   sessão também protege as rotas e APIs desses módulos.

Não abra os módulos pelos endereços `file://`: esse acesso não passa pela
autenticação do servidor. Abrir `login.html` diretamente exibe somente as
instruções e, se houver contas antigas salvas nesse navegador, a opção para
exportá-las para migração.

Como o Gerenciamento de Parada passa a ser servido por HTTP, dados que esse
módulo tenha salvo no armazenamento do navegador sob `file://` não são
transferidos automaticamente.

## Migrar usuários salvos no navegador antigo

1. Abra `Tela Acesso\login.html` diretamente no mesmo navegador e perfil onde
   os usuários antigos foram cadastrados.
2. Selecione **Exportar cadastro antigo para migração** e guarde o JSON em
   local seguro; ele contém senhas antigas.
3. Acesse o servidor, entre como administrador e selecione **Gerenciar
   usuários**.
4. Selecione **Importar cadastro antigo** e escolha o JSON. As senhas são
   armazenadas no servidor como hashes. Depois da confirmação, apague o arquivo
   exportado e reabra o login por `file://` para usar **Apagar cadastro antigo
   deste navegador**.

Como o navegador separa o armazenamento de `file://` e HTTP, os usuários
antigos não são transferidos automaticamente. Contas já existentes no servidor
com o mesmo nome não são substituídas.

---

## 🔐 Funcionalidades Principais

### Login
- ✅ Validação de usuário e senha
- ✅ Visualizar/ocultar senha com ícone 👁️
- ✅ "Lembrar-me" - salva username entre sessões
- ✅ Mensagens de erro personalizadas
- ✅ Verifica se usuário está habilitado

## Gerenciar usuários

Somente a conta administrativa criada na primeira execução pode cadastrar
usuários, habilitar/desabilitar contas e removê-las. Novas senhas devem ter ao
menos 12 caracteres. As senhas são armazenadas no servidor como hashes e não
são devolvidas ao navegador.

## Encerrar sessão

Use **Sair** na tela de sucesso. As sessões expiram após oito horas e também são
encerradas quando o servidor para.

## Observação de segurança

O servidor escuta apenas em `127.0.0.1`. A proteção se aplica ao acesso web por
meio desse servidor; ela não impede que alguém com acesso ao computador abra
os arquivos diretamente pelo sistema operacional.
