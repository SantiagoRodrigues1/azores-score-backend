# 🎮 Live Match Manager - Implementação Backend

## 📋 Arquivos Criados

### 1. `services/liveMatchService.js`
**Descrição**: Serviço com toda a lógica de negócio para gerenciar eventos de jogos.

**Classes/Funções**:
- `startMatch(matchId)` - Inicia um jogo
- `addMatchEvent(matchId, userId, eventData)` - Adiciona evento (golo, cartão, substituição)
- `updateMatchStatus(matchId, newStatus)` - Altera status (live, halftime, second_half, finished)
- `finishMatch(matchId, leagueName, season)` - Termina jogo e atualiza classificações
- `getMatchDetails(matchId)` - Obter jogo com todos os eventos
- `validateManagerPermission(matchId, userId)` - Validar se manager pode gerenciar jogo
- `_updateTeamStanding(...)` - Helper privado para atualizar standings

**Features**:
- ✅ Transações MongoDB (rollback em erro)
- ✅ Validação de permissões
- ✅ Lógica automática de score (goals)
- ✅ Cálculo automático de standings
- ✅ Logging detalhado

---

### 2. `controllers/liveMatchController.js`
**Descrição**: Controllers HTTP que expõem os endpoints.

**Funções**:
- `startMatch(req, res)` - POST /live-match/:matchId/start
- `addMatchEvent(req, res)` - POST /live-match/:matchId/event
- `updateMatchStatus(req, res)` - POST /live-match/:matchId/status
- `finishMatch(req, res)` - POST /live-match/:matchId/finish
- `getMatchDetails(req, res)` - GET /live-match/:matchId
- `addAddedTime(req, res)` - POST /live-match/:matchId/added-time

**Features**:
- ✅ Validação de input
- ✅ Error handling
- ✅ Socket.io integration (opcional)
- ✅ Respostas JSON estruturadas

---

### 3. `routes/liveMatchRoutes.js`
**Descrição**: Definição de rotas com middleware de autenticação e RBAC.

**Rotas**:
```
POST   /live-match/:matchId/start
POST   /live-match/:matchId/event
POST   /live-match/:matchId/status
POST   /live-match/:matchId/finish
POST   /live-match/:matchId/added-time
GET    /live-match/:matchId
```

**Middleware**:
- `verifyToken` - Valida JWT
- `verifyRole(['team_manager', 'admin'])` - Valida role

---

### 4. `server.js` (Modificado)
**Mudanças**:
- Adicionado import: `const liveMatchRoutes = require('./routes/liveMatchRoutes');`
- Registada rota: `app.use('/api/live-match', liveMatchRoutes);`

---

## 🔌 API Endpoints

### 1. Iniciar Jogo
```
POST /api/live-match/:matchId/start

Headers:
  Authorization: Bearer {JWT_TOKEN}
  Content-Type: application/json

Response (200):
{
  "success": true,
  "message": "Jogo iniciado com sucesso",
  "data": { Match object }
}
```

### 2. Adicionar Evento
```
POST /api/live-match/:matchId/event

Body:
{
  "type": "goal" | "yellow_card" | "red_card" | "substitution",
  "minute": number (0-120),
  "playerId": string (para goal/cartão),
  "playerInId": string (para substituição),
  "playerOutId": string (para substituição)
}

Response (201):
{
  "success": true,
  "message": "Evento adicionado com sucesso",
  "data": { Match object }
}
```

### 3. Atualizar Status
```
POST /api/live-match/:matchId/status

Body:
{
  "status": "live" | "halftime" | "second_half" | "finished"
}

Response (200):
{
  "success": true,
  "message": "Status do jogo atualizado para: {status}",
  "data": { Match object }
}
```

### 4. Terminar Jogo
```
POST /api/live-match/:matchId/finish

Body:
{
  "league": "Campeonato dos Açores",
  "season": "2025/2026"
}

Response (200):
{
  "success": true,
  "message": "Jogo terminado e classificações atualizadas",
  "data": { Match object }
}
```

### 5. Adicionar Tempo
```
POST /api/live-match/:matchId/added-time

Body:
{
  "minutes": number (> 0)
}

Response (200):
{
  "success": true,
  "message": "{n} minuto(s) adicional(is) adicionado(s)",
  "data": { Match object }
}
```

### 6. Ver Detalhes
```
GET /api/live-match/:matchId

Response (200):
{
  "success": true,
  "data": { Match object com eventos completos }
}
```

---

## 📊 Fluxo de Dados

```
Frontend (React)
    ↓
liveMatchService.ts (Client API)
    ↓
HTTP Request (JWT no header)
    ↓
liveMatchRoutes.js (middleware: verifyToken, verifyRole)
    ↓
liveMatchController.js (validação input)
    ↓
liveMatchService.js (business logic)
    ↓
MongoDB (Match, Standing collections)
    ↓
HTTP Response
    ↓
Frontend (Atualiza state)
```

---

## 🔒 Segurança

### Validações Implementadas

1. **JWT Token**
   - Verificado em cada requisição
   - Decodificado: `req.user = decoded`
   - Contém: `{ id, email, role, assignedTeam }`

2. **Role-Based Access Control (RBAC)**
   - Apenas `team_manager` ou `admin` podem acessar
   - Verificado no middleware `verifyRole`

3. **Manager Permission**
   - Manager só pode gerenciar jogo da sua equipa
   - Verificado em `validateManagerPermission()`
   - Comparação: `user.assignedTeam === match.homeTeam || match.awayTeam`

4. **Input Validation**
   - Tipo de evento: whitelist ['goal', 'yellow_card', 'red_card', 'substitution']
   - Minuto: 0-120
   - Status: validação enumerada
   - PlayerId: obrigatório para goal/cartão

5. **Database Transactions**
   - Usa `session.startTransaction()`
   - Rollback automático em caso de erro
   - Garante consistência de dados

---

## 📦 Modelo de Dados (MongoDB)

### Match Document
```javascript
{
  _id: ObjectId,
  homeTeam: ObjectId,          // Ref: Club
  awayTeam: ObjectId,          // Ref: Club
  date: Date,
  time: String,                // HH:MM
  competition: ObjectId,       // Ref: Competition
  stadium: String,
  status: String,              // "scheduled", "live", "halftime", "second_half", "finished"
  homeScore: Number,           // Default: 0
  awayScore: Number,           // Default: 0
  referee: ObjectId,           // Ref: Referee
  events: [                    // Array de eventos
    {
      type: String,            // "goal", "yellow_card", "red_card", "substitution"
      player: ObjectId,        // Ref: Player
      assistedBy: ObjectId,    // Ref: Player (opcional)
      minute: Number,
      team: ObjectId,          // Ref: Club
      timestamp: Date
    }
  ],
  addedTime: Number,           // Minutos adicionais
  attendance: Number,
  notes: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Standing Document
```javascript
{
  _id: ObjectId,
  league: String,              // "Campeonato dos Açores"
  season: String,              // "2025/2026"
  team: String,                // Nome da equipa
  position: Number,
  played: Number,              // Jogos
  won: Number,                 // Vitórias
  drawn: Number,               // Empates
  lost: Number,                // Derrotas
  goalsFor: Number,            // Golos marcados
  goalsAgainst: Number,        // Golos sofridos
  goalDifference: Number,      // (goalsFor - goalsAgainst)
  points: Number,              // Pontos (vitória=3, empate=1, derrota=0)
  lastUpdated: Date
}
```

---

## 🧪 Exemplos de Teste

### Com CURL

#### 1. Iniciar Jogo
```bash
curl -X POST http://localhost:3000/api/live-match/660f1d8c0d1a2b3c4d5e6f7g/start \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

#### 2. Registar Golo
```bash
curl -X POST http://localhost:3000/api/live-match/660f1d8c0d1a2b3c4d5e6f7g/event \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "type": "goal",
    "minute": 35,
    "playerId": "660f1d8c0d1a2b3c4d5e6f7h"
  }'
```

#### 3. Terminar Jogo
```bash
curl -X POST http://localhost:3000/api/live-match/660f1d8c0d1a2b3c4d5e6f7g/finish \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "league": "Campeonato dos Açores",
    "season": "2025/2026"
  }'
```

---

## 🚀 Integração com Socket.io (Opcional)

A estrutura está preparada para Socket.io:

```javascript
// Na resposta do controller
const io = req.app.get('io');
if (io) {
  io.emit(`match:${matchId}:update`, {
    event: 'new_event',
    match: updatedMatch
  });
}
```

Para ativar, adicionar em `server.js`:
```javascript
const http = require('http');
const socketIO = require('socket.io');

const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: '*' } });

app.set('io', io);

server.listen(PORT, () => {
  console.log(`Socket.io ativo na porta ${PORT}`);
});
```

---

## 📝 Logging

Exemplo de logs durante execução:

```
✅ [POST /api/live-match/abc123/start] Token válido
✅ Jogo iniciado: Pico FC vs Santa Cruz
📝 Adicionando evento: goal no minuto 35
⚽ Golo! Pico FC 1 - 0 Santa Cruz
✅ Evento adicionado com sucesso

🏁 Terminando jogo e atualizando classificações...
📊 Resultado: Pico FC 2 - 1 Santa Cruz
  ✅ Pico FC: Vitória (+3 pontos)
  ❌ Santa Cruz: Derrota (0 pontos)
✅ Classificações atualizadas com sucesso
```

---

## ✅ Checklist de Qualidade

- [x] Sem erros de sintaxe
- [x] Validação completa de input
- [x] Error handling com try-catch
- [x] Transações MongoDB com rollback
- [x] Logging estruturado
- [x] Comentários no código
- [x] Código limpo e legível
- [x] Segurança (JWT + RBAC)
- [x] Endpoints testáveis
- [x] Production-ready

---

## 🔧 Troubleshooting

### Erro: "Manager não autorizado para este jogo"
**Causa**: O manager não pertence a nenhuma das equipas do jogo.  
**Solução**: Verificar `assignedTeam` do user vs `homeTeam`/`awayTeam` do match.

### Erro: "Token inválido"
**Causa**: JWT expirado ou inválido.  
**Solução**: Login novamente para obter novo token.

### Erro: "Status do jogo não permite esta ação"
**Causa**: Tentou adicionar evento quando status não é "live" ou "second_half".  
**Solução**: Primeiro iniciar jogo com `/start`.

### Erro: "Classificações não atualizaram"
**Causa**: `finishMatch` não foi chamado ou houve erro na transação.  
**Solução**: Verificar logs do backend para mais detalhes.

---

## 📚 Referências

- Express.js: https://expressjs.com/
- Mongoose: https://mongoosejs.com/
- JWT: https://jwt.io/
- MongoDB Transactions: https://docs.mongodb.com/manual/transactions/
