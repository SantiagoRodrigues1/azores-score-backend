/**
 * refereeSignupController.js
 * Controlador para registo de árbitros
 */
const User = require('../models/User');
const RefereeProfile = require('../models/RefereeProfile');
const Notification = require('../models/Notification');
const fs = require('fs').promises;
const path = require('path');
const { signJwt } = require('../utils/jwt');
const logger = require('../utils/logger');

/**
 * SIGNUP - Registar novo árbitro
 * POST /api/referee/signup
 */
exports.signupReferee = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      nomeCompleto,
      dataNascimento,
      telefone,
      numeroCartaoArbitro,
      federacao,
      regiao,
      categoria,
      anosExperiencia
    } = req.body;

    // VALIDAÇÃO
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e password são obrigatórios' });
    }

    if (!nomeCompleto || !dataNascimento || !telefone) {
      return res.status(400).json({ error: 'Dados pessoais incompletos' });
    }

    if (!numeroCartaoArbitro || !categoria || anosExperiencia === undefined) {
      return res.status(400).json({ error: 'Dados de arbitragem incompletos' });
    }

    // Verificar se email já existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email já registado' });
    }

    // Verificar se número de cartão já existe
    const existingReferee = await RefereeProfile.findOne({ numeroCartaoArbitro });
    if (existingReferee) {
      return res.status(400).json({ error: 'Número de cartão já existe' });
    }

    // Validar idade (mínimo 18 anos)
    const dataNasc = new Date(dataNascimento);
    const hoje = new Date();
    let idade = hoje.getFullYear() - dataNasc.getFullYear();
    const mes = hoje.getMonth() - dataNasc.getMonth();
    
    if (mes < 0 || (mes === 0 && hoje.getDate() < dataNasc.getDate())) {
      idade--;
    }

    if (idade < 18) {
      return res.status(400).json({ error: 'Deve ter pelo menos 18 anos' });
    }

    // CRIAR UTILIZADOR
    const newUser = new User({
      name,
      email,
      password,
      role: 'referee',
      refereeStatus: 'pending', // Aguardando aprovação
      dataSubmissaoArbitro: new Date()
    });

    // Guardar utilizador (password será encriptado no pre-save middleware)
    await newUser.save();

    // CRIAR PERFIL DE ÁRBITRO
    let documentoURL = null;
    if (req.file) {
      // Guardar ficheiro se upload disponível
      const uploadsDir = path.join(__dirname, '../uploads/referee-documents');

      await fs.mkdir(uploadsDir, { recursive: true });

      const fileName = `${newUser._id}_${Date.now()}.${req.file.originalname.split('.').pop()}`;
      const filePath = path.join(uploadsDir, fileName);
      
      await fs.writeFile(filePath, req.file.buffer);
      documentoURL = `/uploads/referee-documents/${fileName}`;
    }

    const refereeProfile = new RefereeProfile({
      userId: newUser._id,
      nomeCompleto,
      dataNascimento: dataNasc,
      idade,
      telefone,
      numeroCartaoArbitro,
      federacao: federacao || 'FAA',
      regiao: regiao || 'São Miguel',
      categoria,
      anosExperiencia,
      documentoURL,
      documentoType: req.file ? (req.file.mimetype.includes('pdf') ? 'pdf' : 'image') : null,
      dataUploadDocumento: req.file ? new Date() : null
    });

    await refereeProfile.save();

    // NOTIFICAR ADMINS
    const admins = await User.find({ role: 'admin' });
    
    for (const admin of admins) {
      const notification = new Notification({
        userId: admin._id,
        tipo: 'pedido_pendente',
        titulo: 'Novo Pedido de Árbitro',
        mensagem: `${nomeCompleto} submeteu um pedido de registo como árbitro`,
        descricao: `Categoria: ${categoria} | Federação: ${federacao || 'FAA'}`,
        refereeProfileId: refereeProfile._id,
        acaoUrl: `/admin/referees/pending`,
        botaoTexto: 'Ver Pedido',
        icone: 'user-check',
        cor: 'blue'
      });
      
      await notification.save();
    }

    // GERAR JWT TOKEN
    const token = signJwt(
      { id: newUser._id, email: newUser.email, role: newUser.role },
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registo como árbitro realizado com sucesso! Aguardando aprovação do administrador.',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        refereeStatus: newUser.refereeStatus
      },
      refereeProfile: {
        id: refereeProfile._id,
        nomeCompleto: refereeProfile.nomeCompleto,
        numeroCartaoArbitro: refereeProfile.numeroCartaoArbitro,
        categoria: refereeProfile.categoria
      }
    });

  } catch (error) {
    logger.error('Erro no signup de árbitro', error.message);
    res.status(500).json({ error: 'Erro ao registar árbitro: ' + error.message });
  }
};

/**
 * LOGIN - Autenticar árbitro
 * POST /api/referee/login
 */
exports.loginReferee = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password são obrigatórios' });
    }

    // Encontrar utilizador
    const user = await User.findOne({ email });
    
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Email ou password incorretos' });
    }

    // Se não é árbitro, rejeitar
    if (user.role !== 'referee') {
      return res.status(403).json({ error: 'Conta não é árbitro' });
    }

    // Verificar status
    if (user.refereeStatus === 'rejected') {
      return res.status(403).json({
        error: 'Pedido de árbitro foi rejeitado',
        refusedReason: user.refereeRejectionReason,
        status: 'rejected'
      });
    }

    if (user.refereeStatus === 'pending') {
      // Permitir login mas notificar que conta está pendente
      const token = signJwt(
        { id: user._id, email: user.email, role: user.role },
        { expiresIn: '7d' }
      );

      return res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          refereeStatus: user.refereeStatus
        },
        message: 'Conta em verificação. Aguarde aprovação do administrador.',
        status: 'pending'
      });
    }

    // Se aprovado, permitir acesso completo
    const token = signJwt(
      { id: user._id, email: user.email, role: user.role },
      { expiresIn: '7d' }
    );

    // Atualizar último login
    user.updatedAt = new Date();
    await user.save();

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        refereeStatus: user.refereeStatus
      },
      status: 'approved'
    });

  } catch (error) {
    logger.error('Erro no login', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
};

/**
 * GET REFEREE PROFILE - Obter perfil do árbitro autenticado
 * GET /api/referee/profile
 */
exports.getRefereeProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password');
    
    const refereeProfile = await RefereeProfile.findOne({ userId: req.user.id })
      .populate('jogosHistorico', 'data local equipas status');

    if (!user || !refereeProfile) {
      return res.status(404).json({ error: 'Perfil não encontrado' });
    }

    res.json({
      user,
      refereeProfile
    });

  } catch (error) {
    logger.error('Erro ao obter perfil', error);
    res.status(500).json({ error: 'Erro ao obter perfil' });
  }
};

/**
 * UPDATE REFEREE PROFILE - Atualizar perfil do árbitro
 * PUT /api/referee/profile
 */
exports.updateRefereeProfile = async (req, res) => {
  try {
    const { nomeCompleto, telefone, regiao, anosExperiencia, disponibilidadeSemanal } = req.body;

    const refereeProfile = await RefereeProfile.findOne({ userId: req.user.id });
    
    if (!refereeProfile) {
      return res.status(404).json({ error: 'Perfil de árbitro não encontrado' });
    }

    // Atualizar apenas campos permitidos
    if (nomeCompleto) refereeProfile.nomeCompleto = nomeCompleto;
    if (telefone) refereeProfile.telefone = telefone;
    if (regiao) refereeProfile.regiao = regiao;
    if (anosExperiencia !== undefined) refereeProfile.anosExperiencia = anosExperiencia;
    if (disponibilidadeSemanal) refereeProfile.disponibilidadeSemanal = disponibilidadeSemanal;

    refereeProfile.atualizadoEm = new Date();
    await refereeProfile.save();

    res.json({
      message: 'Perfil atualizado com sucesso',
      refereeProfile
    });

  } catch (error) {
    logger.error('Erro ao atualizar perfil', error);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
};
