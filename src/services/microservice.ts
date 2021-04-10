import axios from 'axios';
import querystring from 'querystring';
import { MICROSERVICE_URL } from '../helpers/constants';

type WDLData = {
  white_win: number,
  draw: number,
  black_win: number
};

type WDLResponse = { message: string, data: WDLData | null, error: string | null };

export const getWDL = (fen: string, white_time: number, black_time: number): Promise<WDLData | null> => {
  const data = { fen, white_time, black_time };
  return axios
    .get<WDLResponse>(`${MICROSERVICE_URL}/models/wdl?${querystring.stringify(data)}`)
    .then((res) => res.data.data)
    .catch(() => null);
};
