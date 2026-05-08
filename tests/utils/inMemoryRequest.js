import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';

const normalizeHeaderName = (name) => String(name).toLowerCase();

const serializeBody = (body, headers) => {
  if (body === undefined || body === null) {
    return null;
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  if (!headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  return Buffer.from(JSON.stringify(body));
};

class RequestSocket extends Duplex {
  constructor() {
    super();
    this.encrypted = false;
    this.remoteAddress = '127.0.0.1';
  }

  _read() {}

  _write(_chunk, _encoding, callback) {
    callback();
  }

  address() {
    return {
      address: '127.0.0.1',
      family: 'IPv4',
      port: 0
    };
  }

  setTimeout() {}

  setNoDelay() {}

  setKeepAlive() {}
}

class ResponseSocket extends Duplex {
  constructor() {
    super();
    this.encrypted = false;
    this.remoteAddress = '127.0.0.1';
    this.output = [];
  }

  _read() {}

  _write(chunk, _encoding, callback) {
    this.output.push(Buffer.from(chunk));
    callback();
  }

  address() {
    return {
      address: '127.0.0.1',
      family: 'IPv4',
      port: 0
    };
  }

  setTimeout() {}

  setNoDelay() {}

  setKeepAlive() {}
}

const extractBodyBuffer = (socket) => {
  const rawResponse = Buffer.concat(socket.output);
  const separator = rawResponse.indexOf('\r\n\r\n');

  if (separator === -1) {
    return Buffer.alloc(0);
  }

  return rawResponse.subarray(separator + 4);
};

const buildResponse = (response, socket) => {
  const headers = response.getHeaders();
  const bodyBuffer = extractBodyBuffer(socket);
  const text = bodyBuffer.toString('utf8');
  const contentType = headers['content-type'];

  let body = text;
  if (typeof contentType === 'string' && contentType.includes('application/json')) {
    body = text ? JSON.parse(text) : {};
  }

  return {
    status: response.statusCode,
    statusCode: response.statusCode,
    headers,
    body,
    text
  };
};

const executeRequest = async (app, { method, path, headers, body }) => {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [normalizeHeaderName(name), value])
  );
  const bodyBuffer = serializeBody(body, normalizedHeaders);

  if (!normalizedHeaders.host) {
    normalizedHeaders.host = '127.0.0.1';
  }

  if (bodyBuffer && !normalizedHeaders['content-length']) {
    normalizedHeaders['content-length'] = String(bodyBuffer.length);
  }

  const requestSocket = new RequestSocket();
  const responseSocket = new ResponseSocket();
  const request = new IncomingMessage(requestSocket);
  request.method = method;
  request.url = path;
  request.originalUrl = path;
  request.headers = normalizedHeaders;
  request.rawHeaders = Object.entries(normalizedHeaders).flatMap(([name, value]) => {
    if (Array.isArray(value)) {
      return [name, value.join(', ')];
    }
    return [name, String(value)];
  });
  request.connection = requestSocket;
  request.socket = requestSocket;

  const response = new ServerResponse(request);
  response.assignSocket(responseSocket);

  return await new Promise((resolve, reject) => {
    response.once('error', reject);
    responseSocket.once('error', reject);
    request.once('error', reject);

    response.once('finish', () => {
      try {
        const result = buildResponse(response, responseSocket);
        response.detachSocket(responseSocket);
        requestSocket.destroy();
        responseSocket.end();
        responseSocket.destroy();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    try {
      if (typeof app.handle === 'function') {
        app.handle(request, response);
      } else {
        app(request, response);
      }
    } catch (error) {
      reject(error);
      return;
    }

    if (bodyBuffer) {
      request.push(bodyBuffer);
    }
    request.push(null);
  });
};

class InMemoryRequestBuilder {
  constructor(app, method, path) {
    this.app = app;
    this.method = method;
    this.path = path;
    this.headers = {};
    this.body = undefined;
    this.execution = null;
  }

  set(name, value) {
    if (typeof name === 'object' && name !== null) {
      Object.assign(this.headers, name);
      return this;
    }

    this.headers[name] = value;
    return this;
  }

  send(body) {
    this.body = body;
    return this;
  }

  execute() {
    if (!this.execution) {
      this.execution = executeRequest(this.app, {
        method: this.method,
        path: this.path,
        headers: this.headers,
        body: this.body
      });
    }

    return this.execution;
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.execute().catch(onRejected);
  }

  finally(onFinally) {
    return this.execute().finally(onFinally);
  }
}

const createMethod = (app, method) => (path) => new InMemoryRequestBuilder(app, method, path);

export default function request(app) {
  return {
    get: createMethod(app, 'GET'),
    post: createMethod(app, 'POST'),
    put: createMethod(app, 'PUT'),
    delete: createMethod(app, 'DELETE'),
    patch: createMethod(app, 'PATCH')
  };
}
