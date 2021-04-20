import axios from 'axios';
import querystring from 'querystring';
import { WDLData, WDLResponse } from 'types/microservice';
import { MICROSERVICE_URL } from '../helpers/constants';

const getWDL = (fen: string, white_time: number, black_time: number): Promise<WDLData | null> => axios
  .get<WDLResponse>(`${MICROSERVICE_URL}/models/wdl?${querystring.stringify({ fen, white_time, black_time })}`)
  .then((res) => res.data.data)
  .catch((error) => {
    console.log(error);
    return null;
  });

const microservice = {
  getWDL,
};

export default microservice;
