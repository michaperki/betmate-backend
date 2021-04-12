import axios from 'axios';
import querystring from 'querystring';
import { MICROSERVICE_URL } from '../helpers/constants';

type WDLData = {
  white_win: number,
  draw: number,
  black_win: number
};

type WDLResponse = {
  message: string,
  data: WDLData | null,
  error: string | null
};

const getWDL = (fen: string, white_time: number, black_time: number): Promise<WDLData | null> => axios
  .get<WDLResponse>(`${MICROSERVICE_URL}/models/wdl?${querystring.stringify({ fen, white_time, black_time })}`)
  .then((res) => res.data.data)
  .catch(() => null);

const microservice = {
  getWDL,
};

export default microservice;
