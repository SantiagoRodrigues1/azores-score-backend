# AzoresScore Backend

API do AzoresScore para gestão de utilizadores, equipas, jogos, live match, notificações, comunidade e fluxos administrativos. O projeto usa Node.js, Express e MongoDB com Mongoose, com autenticação JWT e proteção por papéis.

## Overview

- Stack: Node.js, Express 5, MongoDB, Mongoose
- Auth: JWT sem fallback secret, payload normalizado com `id`
- Access control: `fan`, `referee`, `club_manager`, `team_manager`, `admin`
- Quality gate: testes unitários e testes de integração com app real
- Logging: silencioso por default em testes, com debug opcional por flag de ambiente

## Implemented Features

- Registo e login de utilizadores com registo público limitado a `fan`
- Criação de administradores apenas por administradores autenticados
- Gestão de equipas, plantéis, jogadores e dashboards de gestão
- Live match com proteção por role e validação de posse
- Edit requests com fluxo completo de aprovação e rejeição
- Notificações para favoritos e eventos relevantes
- Community feed e submissões de conteúdo
- Fluxos de árbitro, relatórios e áreas administrativas

## Requirements

- Node.js 20+
- MongoDB 7+

## Setup

1. Instalar dependências.

```bash
npm install
```

2. Criar `.env` a partir de `.env.example`.

3. Configurar pelo menos as variáveis obrigatórias.

```env
MONGO_URI=mongodb://localhost:27017/azores_score
JWT_SECRET=substituir-por-um-segredo-forte
PORT=3000
NODE_ENV=development
```

4. Iniciar a API.

```bash
npm start
```

## Environment Variables

Obrigatórias:

- `MONGO_URI`: ligação principal ao MongoDB.
- `JWT_SECRET`: segredo usado para assinar e validar JWT.

Opcionais:

- `PORT`: porta HTTP da API. Default: `3000`.
- `NODE_ENV`: `development`, `test` ou `production`.
- `JWT_EXPIRES_IN`: duração dos tokens JWT.
- `PUBLIC_API_URL`: base URL para assets locais.
- `CORS_ORIGIN`: origem permitida para o frontend.
- `LOG_LEVEL`: `debug`, `info`, `warn`, `error` ou `silent`.
- `DEBUG_LOGS`: quando `true`, ativa logs de debug mesmo fora do `LOG_LEVEL`.
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Cloudinary só é ativado quando as três variáveis estão definidas. Configuração parcial falha na validação de arranque para evitar uploads inconsistentes.

## Running

Arrancar a API:

```bash
npm start
```

Executar todos os testes:

```bash
npm test
```

Os testes de integração usam `mongodb-memory-server`, arrancam a aplicação real via `createApp()` e agora executam sem logs de bootstrap por default.

## Project Structure

- `server.js`: bootstrap do Express e middleware global.
- `config/`: carregamento de ambiente e ligação à base de dados.
- `controllers/`: orquestração HTTP.
- `services/`: lógica de negócio reutilizável.
- `models/`: esquemas Mongoose.
- `middleware/`: autenticação, autorização e validação.
- `routes/`: definição das rotas HTTP.
- `utils/`: helpers reutilizáveis, incluindo JWT, paginação e logging.
- `tests/integration/`: validação da aplicação real.

## Security Notes

- Sem fallback secrets para JWT.
- Criação pública de admins bloqueada.
- Validação de papéis aplicada nas rotas sensíveis.
- Live match protegido para admin e manager autorizado.
- A API falha no arranque se variáveis críticas estiverem ausentes.

## Delivery Status

- Test suites: `10/10` a passar
- Tests: `24/24` a passar
- Output de testes limpo, sem logs de bootstrap e sem warnings Mongoose conhecidos
