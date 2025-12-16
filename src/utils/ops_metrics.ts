type Counters = {
  analysis429: number;
  auth429: number;
  billingIntent429: number;
};

const counters: Counters = {
  analysis429: 0,
  auth429: 0,
  billingIntent429: 0,
};

export const opsMetrics = {
  inc: (key: keyof Counters) => { counters[key] += 1; },
  get: (): Counters => ({ ...counters }),
  reset: () => { counters.analysis429 = counters.auth429 = counters.billingIntent429 = 0; },
};

export default opsMetrics;

