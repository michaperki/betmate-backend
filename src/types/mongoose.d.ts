import { Query, Aggregate } from 'mongoose';

declare module 'mongoose' {
  interface Query<ResultType, DocType, THelpers = {}, RawDocType = DocType> {
    /**
     * Cache the results of this query for the specified number of seconds
     * @param ttlSeconds Time to live in seconds for cached results
     */
    cache(ttlSeconds?: number): this;
  }

  interface Aggregate<R> {
    /**
     * Cache the results of this aggregation for the specified number of seconds
     * @param ttlSeconds Time to live in seconds for cached results
     */
    cache(ttlSeconds?: number): this;
  }
}

declare module 'mongodb' {
  interface ObjectId {
    toString(): string;
  }
}

// Define a function signature for Types.ObjectId
declare module 'mongoose' {
  namespace Types {
    // Make sure constructor is a function that returns ObjectId
    function ObjectId(id?: string | number | ObjectId): ObjectId;
  }
}