import mongoose from 'mongoose';

// Simple in-memory cache
const queryCache: Map<string, {
  data: any;
  expiry: number;
}> = new Map();

// TypeScript type guard to check if an object is an Aggregate
const isAggregate = (obj: any): obj is mongoose.Aggregate<any> => {
  return obj && obj.constructor && obj.constructor.name === 'Aggregate';
};

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
(mongoose.Query.prototype as any).cache = function(ttlSeconds = 60) {
  // Store original exec function
  const exec = mongoose.Query.prototype.exec;

  // Add cache flag to this query instance
  (this as any)._cache = true;
  (this as any)._cacheTTL = ttlSeconds * 1000; // Convert to milliseconds

  // Override exec function to implement caching
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

  // Return the query object for chaining
  return this;
};

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

// Add cache method to Aggregate prototype
(mongoose.Aggregate.prototype as any).cache = function(ttlSeconds = 60) {
  // Store original exec function
  const exec = mongoose.Aggregate.prototype.exec;

  // Add cache flag to this aggregate instance
  (this as any)._cache = true;
  (this as any)._cacheTTL = ttlSeconds * 1000; // Convert to milliseconds

  // Override exec function to implement caching
  mongoose.Aggregate.prototype.exec = async function() {
    // Skip caching if it's disabled for this aggregate
    if (!(this as any)._cache) {
      return exec.apply(this, arguments);
    }

    // Generate cache key from aggregate details
    const key = JSON.stringify({
      collection: this._model?.collection.name || 'unknown',
      pipeline: this.pipeline(),
      options: this.options || {}
    });

    // Check if we have a valid cached result
    const now = Date.now();
    const cachedValue = queryCache.get(key);

    if (cachedValue && cachedValue.expiry > now) {
      // Return cached data (cloned to prevent modification)
      return JSON.parse(JSON.stringify(cachedValue.data));
    }

    // Execute the original aggregate
    const result = await exec.apply(this, arguments);

    // Cache the result with expiry
    queryCache.set(key, {
      data: result,
      expiry: now + (this as any)._cacheTTL
    });

    return result;
  };

  // Return the aggregate object for chaining
  return this;
};

export default () => {
  // This function is called to initialize the plugin
  // It's already executed by importing this file
};