# RIMS One — autenticação e acesso

O login valida as credenciais no servidor local, não no navegador. Execute
`iniciar.bat` em `Módulo Planejamento e Programação\SAP PM Web` e acesse
<http://127.0.0.1:8765/login>.

## Primeiro acesso

1. Na primeira execução, crie a conta administrativa no terminal. Use uma
   senha com pelo menos 12 caracteres; ela não será exibida enquanto digitada.
2. Entre por <http://127.0.0.1:8765/login>.
3. Após autenticar, escolha **Gerenciamento de Parada** ou
   **Planejamento e Programação**. As páginas e APIs dos módulos exigem sessão.

Não acesse os módulos por `file://`; isso ignora o servidor. A autenticação
web não impede que alguém com acesso ao computador leia os arquivos locais.

## Migrar contas antigas

O navegador separa os dados de `file://` e HTTP. Para transferir cadastros
existentes no login antigo:

1. Abra `Tela Acesso\login.html` por `file://` no navegador e perfil originais.
2. Selecione **Exportar cadastro antigo para migração** e guarde o JSON em
   local seguro; o arquivo contém senhas antigas.
3. Entre no servidor como administrador, abra **Gerenciar usuários** e use
   **Importar cadastro antigo**.
4. Após a confirmação, apague o arquivo exportado e reabra o login antigo para
   usar **Apagar cadastro antigo deste navegador**. Contas já existentes no
   servidor com o mesmo usuário não são substituídas.

## Contas e sessões

- Não há contas de demonstração predefinidas.
- A conta administrativa inicial é criada no terminal; sua senha não é salva
  em texto puro.
- Novas senhas exigem no mínimo 12 caracteres e são armazenadas como hashes
  PBKDF2-HMAC-SHA256 no SQLite local.
- O cookie de sessão é `HttpOnly`; as sessões expiram após oito horas e deixam
  de valer quando o servidor é reiniciado.
- O nome de usuário pode ser lembrado no navegador, mas a senha não é salva.
