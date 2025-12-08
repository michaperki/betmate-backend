declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test' | string;
      PORT?: string;
      JWT_SECRET?: string;
      MONGODB_URI?: string;
      // ... add other environment variables here
    }
    
    // Augment the NodeJS.Global type so `global.serverStartTime` is typed
    interface Global {
      serverStartTime: number;
    }
  }
  
  // Global variables for the server
  var serverStartTime: number; // Tracks server boot/deployment time
}

export {};
