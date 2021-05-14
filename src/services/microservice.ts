import axios from 'axios';
import querystring from 'querystring';
import { WDLData, TopMoveData, MicroserviceResponse } from 'types/microservice';
import { MICROSERVICE_URL } from 'helpers/constants';

const getWDL = (fen: string, white_time: number, black_time: number): Promise<WDLData | null> => (
  axios
    .get<MicroserviceResponse<WDLData>>(`${MICROSERVICE_URL}/models/wdl?${querystring.stringify({ fen, white_time, black_time })}`)
    .then((res) => res.data.data)
    .catch((error) => {
      console.log(error.request.data);
      return null;
    })
);

const getTopMoves = (fen: string, n: number): Promise<TopMoveData | null> => (
  axios
    .get<MicroserviceResponse<TopMoveData>>(`${MICROSERVICE_URL}/models/top_moves?${querystring.stringify({ fen, n })}`)
    .then((res) => res.data.data)
    .catch((error) => {
      console.log(error.request.data);
      return null;
    })
);

const microservice = {
  getWDL,
  getTopMoves,
};

export default microservice;
