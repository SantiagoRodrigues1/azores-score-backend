/**
 * refereeValidation.js
 * Middleware para validação de inputs de árbitro
 */

/**
 * Validar signup de árbitro
 */
exports.validateRefereeSignup = (req, res, next) => {
  const errors = [];

  // Dados de utilizador
  if (!req.body.name || req.body.name.trim().length < 3) {
    errors.push('Nome deve ter pelo menos 3 caracteres');
  }

  if (!req.body.email || !isValidEmail(req.body.email)) {
    errors.push('Email inválido');
  }

  if (!req.body.password || req.body.password.length < 6) {
    errors.push('Password deve ter pelo menos 6 caracteres');
  }

  // Dados pessoais
  if (!req.body.nomeCompleto || req.body.nomeCompleto.trim().length < 3) {
    errors.push('Nome completo deve ter pelo menos 3 caracteres');
  }

  if (!req.body.dataNascimento) {
    errors.push('Data de nascimento é obrigatória');
  } else {
    const dob = new Date(req.body.dataNascimento);
    const idade = calculateAge(dob);
    if (idade < 18) {
      errors.push('Deve ter pelo menos 18 anos');
    }
  }

  if (!req.body.telefone || !isValidPhone(req.body.telefone)) {
    errors.push('Telefone inválido (formato: +351 ou 9XXXXXXXX)');
  }

  // Dados de arbitragem
  if (!req.body.numeroCartaoArbitro || req.body.numeroCartaoArbitro.trim().length < 3) {
    errors.push('Número de cartão inválido');
  }

  if (!['Distrital', 'Nacional', 'Internacional'].includes(req.body.categoria)) {
    errors.push('Categoria inválida');
  }

  if (req.body.anosExperiencia === undefined || req.body.anosExperiencia < 0) {
    errors.push('Anos de experiência inválido');
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

/**
 * Validar login
 */
exports.validateLogin = (req, res, next) => {
  const errors = [];

  if (!req.body.email || !isValidEmail(req.body.email)) {
    errors.push('Email inválido');
  }

  if (!req.body.password) {
    errors.push('Password é obrigatória');
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

/**
 * Validar submissão de relatório
 */
exports.validateReportSubmission = (req, res, next) => {
  const errors = [];

  if (!req.body.matchId) {
    errors.push('ID do jogo é obrigatório');
  }

  if (req.body.comentario && req.body.comentario.length > 5000) {
    errors.push('Comentário muy longo (máximo 5000 caracteres)');
  }

  if (req.body.cartõesAmarelos !== undefined && req.body.cartõesAmarelos < 0) {
    errors.push('Número de cartões amarelos inválido');
  }

  if (req.body.cartõesVermelhos !== undefined && req.body.cartõesVermelhos < 0) {
    errors.push('Número de cartões vermelhos inválido');
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

/**
 * Validar confirmação de presença
 */
exports.validatePresenceConfirmation = (req, res, next) => {
  const errors = [];

  if (!req.body.status) {
    errors.push('Status é obrigatório');
  }

  if (!['confirmed', 'unavailable'].includes(req.body.status)) {
    errors.push('Status inválido (deve ser "confirmed" ou "unavailable")');
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

/**
 * Helper functions
 */

function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function isValidPhone(phone) {
  // Aceita +351, 00351, ou 9XXXXXXXX
  const regex = /^(\+351|00351|9)\d{6,9}$/;
  return regex.test(phone.replace(/\s|-/g, ''));
}

function calculateAge(dob) {
  const hoje = new Date();
  let idade = hoje.getFullYear() - dob.getFullYear();
  const mes = hoje.getMonth() - dob.getMonth();
  
  if (mes < 0 || (mes === 0 && hoje.getDate() < dob.getDate())) {
    idade--;
  }
  
  return idade;
}

/**
 * Validar upload de ficheiro de domucmentação
 */
exports.validateDocumentUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Ficheiro de cartão é obrigatório' });
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({ 
      error: 'Tipo de ficheiro não permitido. Use JPG, PNG ou PDF' 
    });
  }

  const maxSize = 5 * 1024 * 1024; // 5MB
  if (req.file.size > maxSize) {
    return res.status(400).json({ 
      error: 'Ficheiro muito grande (máximo 5MB)' 
    });
  }

  next();
};
