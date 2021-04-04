import mongoose from 'mongoose';

export interface IUser extends mongoose.Document {
    email?: string,
    password?: string,
    first_name?: string,
    last_name?: string,
    full_name?: string,
    resource?: any,
    message?: string,
    _message?: string
}

type compareCallback = (err: any, isMatch: boolean) => void

export interface UserPW extends mongoose.Document {
    comparePassword: (password: string, callback: compareCallback) => void
}

export interface IResource extends mongoose.Document {
    title: string,
    description: string,
    value: number,
    date_resource_created: Date | number,
    child_resources?: any
}