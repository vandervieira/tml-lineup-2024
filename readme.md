# BeatBuddy - Tomorrowland Brasil 2024

BeatBuddy é uma aplicação web interativa desenvolvida para ajudar você e seus amigos a se organizarem durante o festival Tomorrowland Brasil 2024. Com ela, você pode ver onde cada um dos seus amigos estará em cada momento, quais artistas eles planejam assistir e em qual palco estarão.

## Funcionalidades

- **Autenticação com Google**: Faça login de forma segura usando sua conta Google.
- **Seleção de Artistas**: Escolha os artistas que você deseja assistir e veja quais amigos também estarão lá.
- **Visualização de Lineup**: Veja o lineup completo do festival, organizado por dia e palco.
- **Interação em Tempo Real**: Veja em tempo real quais amigos selecionaram os mesmos artistas que você.

## Tecnologias Utilizadas

- **Node.js**: Plataforma de desenvolvimento.
- **Express.js**: Framework para construção de aplicações web.
- **Passport.js**: Middleware de autenticação.
- **PostgreSQL**: Banco de dados relacional.
- **EJS**: Motor de templates para renderização de páginas HTML.
- **Bootstrap**: Framework CSS para design responsivo.
- **Axios**: Cliente HTTP para requisições AJAX.

## Estrutura do Projeto

- **app.js**: Arquivo principal da aplicação, onde as rotas e a lógica do servidor são definidas.
- **views/**: Diretório contendo os templates EJS para renderização das páginas.
- **public/**: Diretório para arquivos estáticos como CSS e JavaScript.
- **schedule.js**: Arquivo contendo a programação do festival.

## Configuração

1. **Clone o repositório**:
   ```bash
   git clone https://github.com/seu-usuario/tml-lineup-2024.git
   cd tml-lineup-2024
   ```

2. **Instale as dependências**:
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**:
   Crie um arquivo `.env` na raiz do projeto e adicione as seguintes variáveis:
   ```plaintext
   PORT=3000
   GOOGLE_CLIENT_ID=seu_google_client_id
   GOOGLE_CLIENT_SECRET=seu_google_client_secret
   GOOGLE_CALLBACK_URL=https://your-app.fly.dev/auth/google/callback
   SESSION_SECRET=uma_string_secreta
   DATABASE_URL=postgres://usuario:senha@host:porta/database
   APP_PASSWORD=sua_senha
   ```

4. **Inicie a aplicação**:
   ```bash
   npm start
   ```

## Deploy

Este projeto foi implantado usando o [Fly.io](https://fly.io/). O arquivo de configuração `fly.toml` está incluído no repositório para facilitar o deploy.

## Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e pull requests para melhorias e correções.

## Licença

Este projeto está licenciado sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## Contato

Criado por [Vander Vieira](https://vandervieira.com.br). Entre em contato para mais informações ou colaborações.