const delay = (ms: number) => new Promise((res) => setTimeout(res, ms * 100));

const delays = [10, 8, 6, 4, 2];

const delayedLoop = async () => {
  let i = 0;
  while (i < delays.length) {
    // eslint-disable-next-line no-await-in-loop
    await delay(delays[i]);
    console.log(delays[i]);
    i += 1;
  }
};

delayedLoop();

export {};
