const User = require('../models/User');
const { signJwt } = require('../utils/jwt');
const { isClubManagerRole, serializeUser } = require('../utils/accessControl');

const generateToken = (user) => {
  const payload = { 
    id: user._id, 
    role: user.role, 
    email: user.email
  };
  
  if (isClubManagerRole(user.role) && user.assignedTeam) {
    payload.assignedTeam = user.assignedTeam._id || user.assignedTeam;
  }
  
  return signJwt(payload, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

const getCurrentUser = async (req, res) => {
  res.json({
    success: true,
    data: {
      user: serializeUser(req.user)
    }
  });
};

const register = async (req, res) => {
  try {
    const { name, username, avatar, email, password } = req.body;

    // Validações
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Nome, email e password são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password deve ter pelo menos 6 caracteres' });
    }

    const userRole = 'fan';

    // Verificar se email já existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email já está registado' });
    }

    if (username) {
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        return res.status(400).json({ success: false, message: 'Username já está registado' });
      }
    }

    // Criar utilizador
    const user = new User({ 
      name, 
      username: username || undefined,
      avatar: avatar || null,
      email, 
      password, 
      role: userRole,
      assignedTeam: null
    });
    await user.save();

    // Populate assignedTeam se existir
    await user.populate('assignedTeam');

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      user: serializeUser(user),
      token
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validações
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email e password são obrigatórios' });
    }

    // Procurar utilizador
    const user = await User.findOne({ email }).populate('assignedTeam');
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Email ou password incorretos' });
    }

    // Verificar password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Email ou password incorretos' });
    }

    // Verificar status da conta
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'A sua conta está suspensa' });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ success: false, message: 'A sua conta está inativa' });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      data: {
        user: serializeUser(user),
        token
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro interno do servidor' });
  }
};

module.exports = { getCurrentUser, register, login };
