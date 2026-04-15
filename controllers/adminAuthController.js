const User = require('../models/User');
const { signJwt, verifyJwt } = require('../utils/jwt');

function buildAdminName(email) {
  const fallback = String(email || 'admin').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return fallback ? `Admin ${fallback}` : 'Admin User';
}

exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios.' });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email já registado.' });

    const user = new User({
      name: name || buildAdminName(email),
      email,
      password,
      role: 'admin',
      status: 'active'
    });
    await user.save();

    res.status(201).json({ message: 'Admin registado com sucesso.' });
  } catch (err) {
    res.status(500).json({
      error: 'Erro ao registar admin.',
      ...(process.env.NODE_ENV === 'test' && err?.message ? { details: err.message } : {})
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, role: 'admin' });
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Conta indisponível.' });
    }

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Credenciais inválidas.' });
    const token = signJwt({ id: user._id, email: user.email, role: 'admin' }, { expiresIn: '2h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao autenticar.' });
  }
};

exports.verify = (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token em falta.' });

  try {
    const decoded = verifyJwt(token);
    return User.findById(decoded.id)
      .select('_id name email role status')
      .lean()
      .then((user) => {
        if (!user || user.status !== 'active' || user.role !== 'admin') {
          return res.status(401).json({ error: 'Token inválido.' });
        }

        return res.json({
          valid: true,
          user: {
            id: String(user._id),
            name: user.name,
            email: user.email,
            role: user.role
          }
        });
      })
      .catch(() => res.status(401).json({ error: 'Token inválido.' }));
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
  }
};
