import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'finance_portal_secret_2024';

/**
 * Middleware: verifica el JWT en el header Authorization.
 * Adjunta req.user = { username, role, database }
 */
export function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado: Token no provisto.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { username, role, database }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'No autorizado: Token inválido o expirado.' });
    }
}

/**
 * Factory de middleware para verificar roles.
 * Uso: requireRole('SUPERVISOR', 'REVISION')
 */
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'No autorizado.' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Acceso denegado. Rol '${req.user.role}' no tiene permiso para esta acción.`
            });
        }
        next();
    };
}

/**
 * Genera un token JWT firmado.
 */
export function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
}
