import jwt from 'jwt-simple';

function tokenForUser(user) {
  const timestamp = new Date().getTime();
  return jwt.encode({ sub: user.id, iat: timestamp }, process.env.AUTH_SECRET);
}

const userController = { tokenForUser };

export default userController;
