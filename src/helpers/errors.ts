class HttpError extends Error {
  code: number;

  messages: string[];

  constructor(code: number, messages: string[]) {
    super(messages.join(', '));
    this.code = code;
    this.messages = messages;

    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export default HttpError;
