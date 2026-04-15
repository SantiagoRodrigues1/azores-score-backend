# SISTEMA DE ÁRBITRO - API DOCUMENTATION

## Guia Completo de Desenvolvimento

---

## 🔐 AUTENTICAÇÃO & SIGNUP

### 1. SIGNUP - Registar como Árbitro
**POST** `/api/referee/signup`

**Request Body (multipart/form-data):**
```json
{
  "name": "João Silva",
  "email": "joao@example.com",
  "password": "senha123",
  "nomeCompleto": "João Pedro Silva",
  "dataNascimento": "1990-05-15",
  "telefone": "912345678",
  "numeroCartaoArbitro": "ARB001/2024",
  "federacao": "FAA",
  "regiao": "São Miguel",
  "categoria": "Nacional",
  "anosExperiencia": 5,
  "documento": <ficheiro PDF ou imagem>
}
```

**Response (201):**
```json
{
  "message": "Registo como árbitro realizado com sucesso! Aguardando aprovação.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "name": "João Silva",
    "email": "joao@example.com",
    "role": "referee",
    "refereeStatus": "pending"
  },
  "refereeProfile": {
    "id": "507f1f77bcf86cd799439012",
    "nomeCompleto": "João Pedro Silva",
    "numeroCartaoArbitro": "ARB001/2024",
    "categoria": "Nacional"
  }
}
```

---

### 2. LOGIN - Autenticar Árbitro
**POST** `/api/referee/login`

**Request Body:**
```json
{
  "email": "joao@example.com",
  "password": "senha123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "name": "João Silva",
    "email": "joao@example.com",
    "role": "referee",
    "refereeStatus": "pending"
  },
  "message": "Conta em verificação. Aguarde aprovação do administrador.",
  "status": "pending"
}
```

---

## 👤 PERFIL DO ÁRBITRO

### 3. GET REFEREE PROFILE
**GET** `/api/referee/profile`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "name": "João Silva",
    "email": "joao@example.com",
    "role": "referee",
    "refereeStatus": "approved"
  },
  "refereeProfile": {
    "id": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "nomeCompleto": "João Pedro Silva",
    "dataNascimento": "1990-05-15",
    "idade": 34,
    "telefone": "912345678",
    "numeroCartaoArbitro": "ARB001/2024",
    "federacao": "FAA",
    "regiao": "São Miguel",
    "categoria": "Nacional",
    "anosExperiencia": 5,
    "documentoURL": "/uploads/referee-documents/507f1f77bcf86cd799439011_1234567890.pdf",
    "jogosTotais": 15,
    "avaliacaoMedia": 4.5,
    "relatóriosEnviados": 10,
    "disponibilidadeSemanal": {
      "segunda": true,
      "terca": true,
      "quarta": false,
      "quinta": true,
      "sexta": true,
      "sabado": true,
      "domingo": false
    },
    "criadoEm": "2024-01-15T10:30:00Z",
    "atualizadoEm": "2024-01-20T15:45:00Z"
  }
}
```

### 4. UPDATE REFEREE PROFILE
**PUT** `/api/referee/profile`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "nomeCompleto": "João Pedro Silva Updated",
  "telefone": "961234567",
  "regiao": "Terceira",
  "anosExperiencia": 6,
  "disponibilidadeSemanal": {
    "segunda": true,
    "terca": true,
    "quarta": true,
    "quinta": true,
    "sexta": true,
    "sabado": true,
    "domingo": true
  }
}
```

**Response (200):**
```json
{
  "message": "Perfil atualizado com sucesso",
  "refereeProfile": { /* dados atualizados */ }
}
```

---

## 📊 DASHBOARD DO ÁRBITRO

### 5. GET REFEREE DASHBOARD
**GET** `/api/referee/dashboard`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "refereeProfile": { /* dados do perfil */ },
  "proximosJogos": [
    {
      "_id": "603f1f77bcf86cd799439020",
      "data": "2024-02-15",
      "hora": "20:30",
      "local": "Estádio Municipal",
      "equipas": ["Team A", "Team B"],
      "competicao": "Campeonato Açores",
      "status": "scheduled"
    }
  ],
  "historicoJogos": [ /* últimos 10 jogos */ ],
  "stats": {
    "jogosTotais": 15,
    "jogosEsteMes": 3,
    "relatóriosEnviados": 10,
    "avaliacaoMedia": 4.5
  },
  "notificacoes": [
    {
      "_id": "604f1f77bcf86cd799439021",
      "titulo": "Novo Jogo Atribuído",
      "mensagem": "Você foi atribuído como árbitro para o jogo em 20/02",
      "lida": false
    }
  ]
}
```

---

## 📅 GESTÃO DE JOGOS

### 6. GET UPCOMING MATCHES
**GET** `/api/referee/matches/upcoming?limit=10&page=1`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "matches": [ /* lista de próximos jogos */ ],
  "pagination": {
    "total": 25,
    "page": 1,
    "limit": 10,
    "pages": 3
  }
}
```

### 7. GET MATCH DETAILS
**GET** `/api/referee/matches/:matchId`

**Response (200):**
```json
{
  "_id": "603f1f77bcf86cd799439020",
  "data": "2024-02-15",
  "hora": "20:30",
  "local": "Estádio Municipal",
  "equipas": [
    { "nome": "Team A", "escudo": "url" },
    { "nome": "Team B", "escudo": "url" }
  ],
  "competicao": "Campeonato Açores",
  "arbitros": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "nomeCompleto": "João Silva",
      "numeroCartaoArbitro": "ARB001/2024",
      "categoria": "Nacional"
    }
  ],
  "status": "scheduled",
  "confirmacoes": [
    {
      "userId": "507f1f77bcf86cd799439011",
      "status": "confirmed",
      "data": "2024-02-13T10:00:00Z"
    }
  ]
}
```

### 8. CONFIRM PRESENCE AT MATCH
**POST** `/api/referee/matches/:matchId/confirm`

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "status": "confirmed"
}
```

**Values for status:**
- `"confirmed"` - Árbitro confirma presença
- `"unavailable"` - Árbitro marca como indisponível

**Response (200):**
```json
{
  "message": "Presença confirmada",
  "match": { /* dados do jogo */ }
}
```

---

## 📈 ESTATÍSTICAS

### 9. GET REFEREE STATISTICS
**GET** `/api/referee/statistics`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "refereeProfile": {
    "nomeCompleto": "João Silva",
    "categoria": "Nacional",
    "avaliacaoMedia": 4.5
  },
  "stats": {
    "jogosTotais": 15,
    "jogosEsteMes": 3,
    "jogos7Dias": 1,
    "relatóriosEnviados": 10,
    "avaliacaoMedia": 4.5
  }
}
```

---

## 🗓️ DISPONIBILIDADE

### 10. GET AVAILABILITY
**GET** `/api/referee/availability`

**Response (200):**
```json
{
  "disponibilidadeSemanal": {
    "segunda": true,
    "terca": true,
    "quarta": false,
    "quinta": true,
    "sexta": true,
    "sabado": true,
    "domingo": false
  }
}
```

### 11. UPDATE AVAILABILITY
**PUT** `/api/referee/availability`

**Request Body:**
```json
{
  "segunda": true,
  "terca": true,
  "quarta": true,
  "quinta": true,
  "sexta": true,
  "sabado": true,
  "domingo": false
}
```

**Response (200):**
```json
{
  "message": "Disponibilidade atualizada",
  "disponibilidadeSemanal": { /* dados atualizados */ }
}
```

---

## 📝 RELATÓRIOS PÓS-JOGO

### 12. SUBMIT MATCH REPORT
**POST** `/api/referee/reports` (multipart/form-data)

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```
matchId: "603f1f77bcf86cd799439020"
comentario: "Jogo bem controlado, equipas respeitaram as regras"
cartõesAmarelos: 4
cartõesVermelhos: 1
penalidades: 2
pdf: <ficheiro PDF>
imagenes: <ficheiros de imagens>
```

**Response (201):**
```json
{
  "message": "Relatório submetido com sucesso",
  "report": {
    "_id": "605f1f77bcf86cd799439030",
    "matchId": "603f1f77bcf86cd799439020",
    "status": "enviado",
    "dataEnvio": "2024-02-15T23:00:00Z"
  }
}
```

### 13. GET MY REPORTS
**GET** `/api/referee/reports?limit=20&page=1`

**Response (200):**
```json
{
  "reports": [
    {
      "_id": "605f1f77bcf86cd799439030",
      "matchId": {
        "_id": "603f1f77bcf86cd799439020",
        "data": "2024-02-15",
        "local": "Estádio Municipal"
      },
      "status": "revisado",
      "dataEnvio": "2024-02-15T23:00:00Z"
    }
  ],
  "pagination": {
    "total": 10,
    "page": 1,
    "limit": 20,
    "pages": 1
  }
}
```

### 14. GET REPORT DETAILS
**GET** `/api/referee/reports/:reportId`

**Response (200):**
```json
{
  "_id": "605f1f77bcf86cd799439030",
  "matchId": { /* dados do jogo */ },
  "refereeId": {
    "nomeCompleto": "João Silva",
    "numeroCartaoArbitro": "ARB001/2024"
  },
  "comentario": "Jogo bem controlado...",
  "pdfURL": "/uploads/match-reports/pdf",
  "imagenURL": ["/uploads/match-reports/images/img1.jpg"],
  "status": "revisado",
  "avaliacao": 5,
  "comentarioAdmin": "Excelente trabalho!",
  "dataEnvio": "2024-02-15T23:00:00Z",
  "dataRevisao": "2024-02-16T10:00:00Z"
}
```

---

## 🛡️ PAINEL ADMINISTRATIVO

### 15. GET PENDING REFEREES (ADMIN)
**GET** `/api/admin/referees/approval/pending?limit=20&page=1`

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response (200):**
```json
{
  "count": 5,
  "total": 5,
  "page": 1,
  "limit": 20,
  "referees": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "nomeCompleto": "João Silva",
      "numeroCartaoArbitro": "ARB001/2024",
      "categoria": "Nacional",
      "federacao": "FAA",
      "anosExperiencia": 5,
      "documentoURL": "/uploads/referee-documents/...",
      "userId": {
        "name": "João Silva",
        "email": "joao@example.com",
        "dataSubmissaoArbitro": "2024-01-15T10:30:00Z"
      }
    }
  ]
}
```

### 16. GET REFEREE DETAILS (ADMIN)
**GET** `/api/admin/referees/approval/:refereeProfileId`

**Response (200):**
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "nomeCompleto": "João Silva",
  "numeroCartaoArbitro": "ARB001/2024",
  "documentoURL": "/uploads/referee-documents/...",
  "userId": { /* dados do utilizador */ },
  "jogosHistorico": []
}
```

### 17. APPROVE REFEREE (ADMIN)
**POST** `/api/admin/referees/approval/:refereeProfileId/approve`

**Response (200):**
```json
{
  "message": "Árbitro aprovado com sucesso",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "refereeStatus": "approved",
    "dataAprovacaoArbitro": "2024-01-20T10:00:00Z"
  },
  "notification": {
    "titulo": "Pedido Aprovado! 🎉",
    "mensagem": "Seu pedido foi aprovado"
  }
}
```

### 18. REJECT REFEREE (ADMIN)
**POST** `/api/admin/referees/approval/:refereeProfileId/reject`

**Request Body:**
```json
{
  "motivo": "Documento inválido. Por favor, envie um cartão válido."
}
```

**Response (200):**
```json
{
  "message": "Árbitro rejeitado",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "refereeStatus": "rejected",
    "refereeRejectionReason": "Documento inválido...",
    "dataRejeitadoArbitro": "2024-01-20T10:00:00Z"
  }
}
```

### 19. GET APPROVAL STATISTICS (ADMIN)
**GET** `/api/admin/referees/approval/stats`

**Response (200):**
```json
{
  "totalReferees": 50,
  "approvedReferees": 35,
  "pendingReferees": 10,
  "rejectedReferees": 5,
  "byCategoria": [
    { "_id": "Distrital", "count": 20 },
    { "_id": "Nacional", "count": 15 }
  ],
  "byRegiao": [
    { "_id": "São Miguel", "count": 30 },
    { "_id": "Terceira", "count": 10 }
  ]
}
```

### 20. GET ALL REPORTS (ADMIN)
**GET** `/api/admin/reports?limit=20&page=1&status=enviado`

**Response (200):**
```json
{
  "reports": [
    {
      "_id": "605f1f77bcf86cd799439030",
      "matchId": { /* dados do jogo */ },
      "refereeId": { /* dados do árbitro */ },
      "status": "enviado",
      "dataEnvio": "2024-02-15T23:00:00Z"
    }
  ],
  "pagination": { /* ... */ }
}
```

### 21. REVIEW REPORT (ADMIN)
**POST** `/api/admin/reports/:reportId/review`

**Request Body:**
```json
{
  "avaliacao": 5,
  "comentarioAdmin": "Excelente trabalho, relatório completo e bem estruturado",
  "status": "aprovado"
}
```

**Response (200):**
```json
{
  "message": "Relatório revisado",
  "report": {
    "avaliacao": 5,
    "comentarioAdmin": "Excelente trabalho...",
    "status": "aprovado",
    "dataRevisao": "2024-02-16T10:00:00Z"
  }
}
```

---

## 🔧 INTEGRAÇÃO NO SERVER.js

```javascript
const refereeRoutes = require('./routes/refereeRoutes');
const adminRefereeRoutes = require('./routes/adminRefereeRoutes');

// Registar rotas
app.use('/api/referee', refereeRoutes);
app.use('/api/admin', adminRefereeRoutes);
```

---

## 📝 CÓDIGOS DE STATUS HTTP

| Status | Significado |
|--------|-------------|
| 200 | OK - Requisição bem-sucedida |
| 201 | Created - Recurso criado |
| 400 | Bad Request - Dados inválidos |
| 401 | Unauthorized - Token ausente ou inválido |
| 403 | Forbidden - Sem permissões |
| 404 | Not Found - Recurso não encontrado |
| 500 | Internal Server Error - Erro do servidor |

---

## 🔒 FLUXO DE SEGURANÇA

1. **Signup** → Utilizador submete dados + cartão → Status = "pending"
2. **Login** → Pode fazer login mas acesso restrito
3. **Pending** → Notificação para admins
4. **Admin Decision** → Aprova ou Rejeita
5. **Approved** → Acesso completo
6. **Rejected** → Mensagem de erro

---

## 💾 MODELOS DE DADOS

### User
- `_id`: ObjectId
- `name`: String
- `email`: String (unique)
- `role`: "referee" | "admin" | ...
- `refereeStatus`: "none" | "pending" | "approved" | "rejected"
- `refereeRejectionReason`: String
- `dataSubmissaoArbitro`: Date
- `dataAprovacaoArbitro`: Date
- `dataRejeitadoArbitro`: Date

### RefereeProfile
- `userId`: ObjectId (ref: User)
- `nomeCompleto`: String
- `dataNascimento`: Date
- `idade`: Number (calculado automaticamente)
- `numeroCartaoArbitro`: String (unique)
- `categoria`: "Distrital" | "Nacional" | "Internacional"
- `anosExperiencia`: Number
- `documentoURL`: String
- `jogosTotais`: Number
- `avaliacaoMedia`: Number (0-5)
- `disponibilidadeSemanal`: { seg, ter, qua, qui, sex, sab, dom }

### MatchReport
- `matchId`: ObjectId (ref: Match)
- `refereeId`: ObjectId (ref: RefereeProfile)
- `userId`: ObjectId (ref: User)
- `comentario`: String
- `pdfURL`: String
- `imagenURL`: [String]
- `status`: "enviado" | "recebido" | "revisado" | "aprovado" | "rejeitado"
- `avaliacao`: Number (0-5)
- `comentarioAdmin`: String

### Notification
- `userId`: ObjectId (ref: User)
- `tipo`: String (novo_jogo_atribuido, pedido_aprovado, etc)
- `titulo`: String
- `mensagem`: String
- `lida`: Boolean
- `matchId`: ObjectId (ref: Match, opcional)

