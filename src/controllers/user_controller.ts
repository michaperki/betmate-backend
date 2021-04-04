import jwt from 'jwt-simple';
import env from 'env-var';

function tokenForUser(user) {
  const timestamp = new Date().getTime();
  return jwt.encode({ sub: user.id, iat: timestamp }, env.get('AUTH_SECRET').required().asString());
}

const userController = { tokenForUser };

export default userController;
