import mongoose from 'mongoose';

export interface IUserBase extends mongoose.Document {
    email?: string,
    password?: string,
    first_name?: string,
    last_name?: string,
    full_name?: string,
    resource?: any,
    message?: string,
    _message?: string,
}

export type CompareCallback = (err: Error, isMatch?: boolean) => void
export interface IUser extends IUserBase {
    comparePassword: (password: string, callback: CompareCallback) => void
}


export interface IResource extends mongoose.Document {
    title: string,
    description: string,
    value: number,
    date_resource_created: Date | number,
    child_resources?: any
}

export interface IWager extends mongoose.Document {
    game_id: mongoose.Types.ObjectId,
    data: string,
    resolved: boolean,
    bettors: string[]
}

export interface IChess extends mongoose.Document {
    title: string,
    state: string,
    players: [string, string],
    move_hist: string[],
    wagers: mongoose.Types.ObjectId[],
    times: [number, number]
}