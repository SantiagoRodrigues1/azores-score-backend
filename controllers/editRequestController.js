const EditRequest = require('../models/EditRequest');
const Player = require('../models/Player');
const asyncHandler = require('../utils/asyncHandler');
const { createUserNotification, createRoleNotifications } = require('../services/features/notificationService');
const teamService = require('../services/teamService');

const editableFieldLabels = {
  name: 'Nome',
  numero: 'Número',
  position: 'Posição',
  email: 'Email',
  nickname: 'Alcunha',
  photo: 'Foto'
};

function formatPlayerName(player) {
  return player?.name || player?.nome || player?.playerSnapshot?.name || player?.playerSnapshot?.nome || 'Jogador';
}

function getPlayerFieldValue(player, field) {
  if (field === 'photo') {
    return player.photo || player.image || null;
  }

  return player[field] ?? null;
}

function applyPlayerFieldUpdate(player, field, value) {
  switch (field) {
    case 'name':
      player.name = String(value).trim();
      if (!player.nome) {
        player.nome = player.name;
      }
      break;
    case 'numero':
      player.numero = String(value).trim();
      break;
    case 'position':
      player.position = String(value).trim();
      break;
    case 'email':
      player.email = value ? String(value).trim().toLowerCase() : '';
      break;
    case 'nickname':
      player.nickname = value ? String(value).trim() : '';
      break;
    case 'photo':
      player.photo = value ? String(value).trim() : '';
      player.image = value ? String(value).trim() : '';
      break;
    default:
      throw new Error('Campo de edição não suportado');
  }
}

function normalizeComparableValue(field, value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (field === 'numero') {
    return String(value).trim();
  }

  return String(value).trim().toLowerCase();
}

function isTeamManagerOwner(reqUser, player) {
  return reqUser.role === 'team_manager' && reqUser.assignedTeam && (player.team?.toString?.() || player.team) === reqUser.assignedTeam?.toString();
}

function buildPlayerSnapshot(player) {
  return {
    id: String(player?._id || player?.id || ''),
    name: player?.name || player?.nome || 'Jogador',
    nome: player?.nome || player?.name || 'Jogador',
    numero: player?.numero !== undefined && player?.numero !== null ? String(player.numero) : '',
    position: player?.position || player?.posicao || 'Outro',
    email: player?.email || '',
    nickname: player?.nickname || '',
    team: player?.team ? String(player.team) : player?.teamId ? String(player.teamId) : null,
    teamName: player?.teamName || null,
    photo: player?.photo || player?.image || null,
    image: player?.image || player?.photo || null
  };
}

function serializePlayerReference(request) {
  if (request?.playerId && typeof request.playerId === 'object' && (request.playerId._id || request.playerId.name || request.playerId.nome)) {
    return request.playerId;
  }

  if (!request?.playerSnapshot) {
    return request?.playerId || null;
  }

  return {
    _id: request.playerSnapshot.id,
    name: request.playerSnapshot.name,
    nome: request.playerSnapshot.nome,
    numero: request.playerSnapshot.numero,
    position: request.playerSnapshot.position,
    email: request.playerSnapshot.email,
    nickname: request.playerSnapshot.nickname,
    team: request.playerSnapshot.team,
    teamName: request.playerSnapshot.teamName,
    photo: request.playerSnapshot.photo,
    image: request.playerSnapshot.image
  };
}

function serializeEditRequest(request) {
  return {
    ...request,
    playerId: serializePlayerReference(request)
  };
}

async function resolvePlayerForEditRequest(playerId) {
  const legacyPlayer = await Player.findById(playerId);
  if (legacyPlayer) {
    return legacyPlayer;
  }

  try {
    return await teamService.getPlayerDetails(playerId);
  } catch (_error) {
    return null;
  }
}

exports.createEditRequest = asyncHandler(async (req, res) => {
  const player = await resolvePlayerForEditRequest(req.body.playerId);

  if (!player) {
    return res.status(404).json({ success: false, message: 'Jogador não encontrado' });
  }

  if (isTeamManagerOwner(req.user, player)) {
    return res.status(409).json({
      success: false,
      message: 'Managers da equipa podem editar este jogador diretamente.'
    });
  }

  const oldValue = getPlayerFieldValue(player, req.body.field);
  if (normalizeComparableValue(req.body.field, oldValue) === normalizeComparableValue(req.body.field, req.body.newValue)) {
    return res.status(409).json({
      success: false,
      message: 'O novo valor tem de ser diferente do valor atual.'
    });
  }

  const editRequest = await EditRequest.create({
    playerId: player._id,
    field: req.body.field,
    oldValue,
    newValue: req.body.newValue,
    justification: req.body.justification,
    proof: req.body.proof || null,
    playerSnapshot: buildPlayerSnapshot(player),
    userId: req.user.id
  });

  await createRoleNotifications({
    role: 'admin',
    title: 'Novo pedido de edição de jogador',
    message: `${req.user.name || 'Um utilizador'} pediu alteração de ${editableFieldLabels[req.body.field] || req.body.field} para ${formatPlayerName(player)}.`,
    type: 'edit_request',
    eventKey: 'edit_request.created',
    actionUrl: '/admin/edit-requests',
    referenceId: editRequest._id,
    payload: {
      playerId: String(player._id),
      field: req.body.field,
      status: 'pending'
    },
    meta: {
      icon: 'clipboard-check',
      color: 'amber',
      buttonText: 'Rever pedido',
      description: req.body.justification
    }
  });

  res.status(201).json({ success: true, data: editRequest });
});

exports.listEditRequests = asyncHandler(async (req, res) => {
  const query = {};
  const status = String(req.query.status || 'pending');

  if (status !== 'all') {
    query.status = status;
  }

  const requests = await EditRequest.find(query)
    .populate('playerId', 'name nome numero position email nickname team photo image')
    .populate('userId', 'name username email role')
    .populate('reviewedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: requests.map(serializeEditRequest) });
});

exports.listMyEditRequests = asyncHandler(async (req, res) => {
  const requests = await EditRequest.find({ userId: req.user.id })
    .populate('playerId', 'name nome numero position email nickname team photo image')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: requests.map(serializeEditRequest) });
});

exports.approveEditRequest = asyncHandler(async (req, res) => {
  const editRequest = await EditRequest.findById(req.params.id);

  if (!editRequest) {
    return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
  }

  if (editRequest.status !== 'pending') {
    return res.status(409).json({ success: false, message: 'Este pedido já foi revisto.' });
  }

  let player = await Player.findById(editRequest.playerId);
  if (player) {
    applyPlayerFieldUpdate(player, editRequest.field, editRequest.newValue);
    await player.save();
  } else {
    player = await teamService.updatePlayerField(String(editRequest.playerId || editRequest.playerSnapshot?.id || ''), editRequest.field, editRequest.newValue);
  }

  editRequest.playerSnapshot = buildPlayerSnapshot(player);

  editRequest.status = 'approved';
  editRequest.reviewNote = req.body.reviewNote || null;
  editRequest.reviewedBy = req.user.id;
  editRequest.reviewedAt = new Date();
  editRequest.appliedAt = new Date();
  await editRequest.save();

  await createUserNotification({
    userId: editRequest.userId,
    title: 'Pedido de edição aprovado',
    message: `O pedido para alterar ${editableFieldLabels[editRequest.field] || editRequest.field} de ${formatPlayerName(player)} foi aprovado.`,
    type: 'edit_request_approved',
    eventKey: 'edit_request.approved',
    actionUrl: `/player/${player._id}`,
    referenceId: editRequest._id,
    payload: {
      playerId: String(player._id),
      status: 'approved'
    },
    meta: {
      icon: 'check-circle',
      color: 'green',
      buttonText: 'Ver jogador'
    }
  });

  res.json({ success: true, data: editRequest });
});

exports.rejectEditRequest = asyncHandler(async (req, res) => {
  const editRequest = await EditRequest.findById(req.params.id).populate('playerId', 'name nome');

  if (!editRequest) {
    return res.status(404).json({ success: false, message: 'Pedido não encontrado' });
  }

  if (editRequest.status !== 'pending') {
    return res.status(409).json({ success: false, message: 'Este pedido já foi revisto.' });
  }

  editRequest.status = 'rejected';
  editRequest.reviewNote = req.body.reviewNote || null;
  editRequest.reviewedBy = req.user.id;
  editRequest.reviewedAt = new Date();
  await editRequest.save();

  await createUserNotification({
    userId: editRequest.userId,
    title: 'Pedido de edição rejeitado',
    message: editRequest.reviewNote
      ? `O teu pedido foi rejeitado. Motivo: ${editRequest.reviewNote}`
      : 'O teu pedido de edição foi rejeitado pela administração.',
    type: 'edit_request_rejected',
    eventKey: 'edit_request.rejected',
    actionUrl: `/player/${editRequest.playerId?._id || editRequest.playerSnapshot?.id || editRequest.playerId}`,
    referenceId: editRequest._id,
    payload: {
      playerId: String(editRequest.playerId?._id || editRequest.playerSnapshot?.id || editRequest.playerId),
      status: 'rejected'
    },
    meta: {
      icon: 'x-circle',
      color: 'red',
      buttonText: 'Ver jogador'
    }
  });

  res.json({ success: true, data: editRequest });
});