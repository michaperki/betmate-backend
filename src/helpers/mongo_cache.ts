import mongoose from 'mongoose';

// Simple in-memory cache
const queryCache: Map<string, { 
  data: any; 
  expiry: number;
}> = new Map();

// Clean up expired cache entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of queryCache.entries()) {
    if (value.expiry <= now) {
      queryCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Add cache method to mongoose Query prototype
if (!mongoose.Query.prototype.hasOwnProperty('cache')) {
  Object.defineProperty(mongoose.Query.prototype, 'cache', {
    value: function(ttlSeconds = 60) {
      // Store original exec function
      const exec = mongoose.Query.prototype.exec;

      // Add cache flag to this query instance
      (this as any)._cache = true;
      (this as any)._cacheTTL = ttlSeconds * 1000; // Convert to milliseconds

      // Only monkey patch the exec function once
      if (!(mongoose.Query.prototype as any)._execMonkeyPatched) {
        mongoose.Query.prototype.exec = async function() {
          // Skip caching if it's disabled for this query
          if (!(this as any)._cache) {
            return exec.apply(this, arguments);
          }

          // Generate cache key from query details
          const key = JSON.stringify({
            collection: this.model.collection.name,
            query: this.getQuery(),
            projection: this.projection(),
            options: this.getOptions()
          });

          // Check if we have a valid cached result
          const now = Date.now();
          const cachedValue = queryCache.get(key);

          if (cachedValue && cachedValue.expiry > now) {
            // Return cached data (cloned to prevent modification)
            return JSON.parse(JSON.stringify(cachedValue.data));
          }

          // Execute the original query
          const result = await exec.apply(this, arguments);

          // Cache the result with expiry
          queryCache.set(key, {
            data: result,
            expiry: now + (this as any)._cacheTTL
          });

          return result;
        };
        (mongoose.Query.prototype as any)._execMonkeyPatched = true;
      }

      // Return the query object for chaining
      return this;
    },
    writable: true
  });
}

// Utility to clear the entire cache
export const clearCache = () => {
  queryCache.clear();
};

// Utility to clear specific cache entries by model name
export const clearModelCache = (modelName: string) => {
  for (const [key, _] of queryCache.entries()) {
    if (key.includes(`"collection":"${modelName}"`)) {
      queryCache.delete(key);
    }
  }
};

export default () => {
  // This function is called to initialize the plugin
  // It's already executed by importing this file
};