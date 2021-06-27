export type PartialWithRequired<T, TRequired extends keyof T> = Partial<T> & Pick<T, TRequired>;
