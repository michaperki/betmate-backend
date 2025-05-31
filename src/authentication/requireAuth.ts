/* eslint-disable func-names */
import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import dotenv from 'dotenv';

import { RequestHandler } from 'express';
import User from '../models/user_model';
import { UserDoc } from '../types/models/user';

dotenv.config();

// We expect JWT token to be passed as bearer token
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.AUTH_SECRET,
};

const jwtLogin = new JwtStrategy(jwtOptions, (payload, done) => {
  // Check if token is expired
  if (payload.exp && payload.exp < Date.now()) {
    return done(null, false, { message: 'Token expired' });
  }
  
  // See if the token matches any user document in the DB
  // Done function in the form -> "done(resulting error, resulting user)"
  User.findById(payload.sub, (err, user: UserDoc) => {
    // This logic can be modified to check for user attributes
    if (err) {
      return done(err, false); // Error return
    } if (user) {
      return done(null, user); // Valid user return
    }
    return done(null, false, { message: 'User not found' }); // Catch no valid user return
  });
});

passport.use(jwtLogin);

// Create function to transmit result of authenticate() call to user or next middleware
const requireAuth: RequestHandler = (req, res, next) => {
  // eslint-disable-next-line prefer-arrow-callback
  passport.authenticate('jwt', { session: false }, (err, user: UserDoc, info) => {
    // Return any existing errors
    if (err) { 
      return next(err); 
    }
    
    // If no user found, return appropriate error message
    if (!user) { 
      const message = info?.message || 'Authentication required';
      return res.status(401).json({ 
        message,
        code: 'AUTHENTICATION_REQUIRED'
      }); 
    }

    // Set user on request for downstream middlewares
    req.user = user;

    // CSRF check temporarily disabled until cookie-parser is set up
    /*
    // Check for CSRF token (if not a GET request)
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      const csrfToken = req.headers['x-csrf-token'];
      const expectedToken = req.cookies?.['csrf-token']; // Assuming you're using cookie-parser
      
      if (!csrfToken || !expectedToken || csrfToken !== expectedToken) {
        return res.status(403).json({
          message: 'CSRF token validation failed',
          code: 'CSRF_VALIDATION_FAILED'
        });
      }
    }
    */

    return next();
  })(req, res, next);
};

// Optional auth middleware - populates user if token exists, but doesn't require it
export const optionalAuth: RequestHandler = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user: UserDoc) => {
    if (err) { return next(err); }
    // If user found, attach to request. If not, continue without error
    if (user) {
      req.user = user;
    }
    return next();
  })(req, res, next);
};

export default requireAuth;