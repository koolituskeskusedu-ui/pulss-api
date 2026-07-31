// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
  };
};

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = (arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
};

// node_modules/hono/dist/utils/body.js
var isRawRequest = (request) => "headers" in request;
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
};
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
};
var handleParsingNestedValues = (form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var _decodeURI = (value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
};
var _getQueryParam = (url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = (str) => tryDecode(str, decodeURIComponent_);
var HonoRequest = class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout) => this.#layout = layout;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res;
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler) => {
    this.errorHandler = handler;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler) => {
    this.#notFoundHandler = handler;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = (request) => request;
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    };
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class _Node {
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = (children) => {
  for (const _ in children) {
    return true;
  }
  return false;
};
var Node2 = class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// src/index.js
var app = new Hono2();
app.use("*", async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGIN || "*";
  const reqOrigin = c.req.header("Origin") || "";
  const origin = allowed === "*" ? reqOrigin || "*" : allowed;
  if (c.req.method === "OPTIONS") {
    return new Response(null, { headers: cors(origin) });
  }
  await next();
  Object.entries(cors(origin)).forEach(([k, v]) => c.res.headers.set(k, v));
});
function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-File-Name",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
    "Access-Control-Max-Age": "86400"
  };
}
var SESSION_MAXAGE = 30 * 24 * 60 * 60;
function sessionCookie(token) {
  return `session=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_MAXAGE}`;
}
function clearCookie() {
  return "session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0";
}
function tokenFromReq(c) {
  const h = c.req.header("Authorization") || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  const cookie = c.req.header("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return m ? m[1] : null;
}
var uid = (p = "") => p + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
var nowISO = () => (/* @__PURE__ */ new Date()).toISOString();
function makeViitenumber(seq) {
  const base = String(seq).padStart(4, "0");
  const w = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += +base[base.length - 1 - i] * w[i % 3];
  return base + (10 - sum % 10) % 10;
}
var b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
var fromB64 = (s) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
async function hashPassword(password, iterations = 1e5) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(bits)}`;
}
async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("pbkdf2$")) return false;
  const [, iterS, saltB64, hashB64] = stored.split("$");
  const salt = fromB64(saltB64);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: +iterS, hash: "SHA-256" }, key, 256);
  return b64(bits) === hashB64;
}
async function auth(c) {
  const token = tokenFromReq(c);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    "SELECT token, subject_id, role, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();
  if (!row) return null;
  if (row.expires_at < nowISO()) {
    await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { id: row.subject_id, role: row.role };
}
function requireRole(session, ...roles) {
  return session && roles.includes(session.role);
}
app.get("/api/health", async (c) => {
  const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM staff").first();
  return c.json({ ok: true, staff: r?.n ?? 0, time: nowISO() });
});
app.post("/api/setup", async (c) => {
  const cnt = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM staff").first();
  if ((cnt?.n ?? 0) > 0) return c.json({ error: "already_initialized" }, 409);
  const { name, login, password } = await c.req.json();
  if (!name || !login || !password) return c.json({ error: "missing_fields" }, 400);
  const hash = await hashPassword(password);
  const id = uid("u_");
  await c.env.DB.prepare(
    "INSERT INTO staff (id, name, login, password_hash, role, perms, scope_all) VALUES (?,?,?,?,?,?,1)"
  ).bind(id, name, login, hash, "admin", "{}").run();
  return c.json({ ok: true, id });
});
app.get("/setup", async (c) => {
  const cnt = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM staff").first();
  const done = (cnt?.n ?? 0) > 0;
  const html = `<!doctype html><html lang="et"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>pulss. \xB7 seadistus</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#F7F6F3;margin:0;padding:44px 16px;color:#12100E}
.card{max-width:420px;margin:0 auto;background:#fff;border:1px solid #E5E2DC;border-radius:14px;padding:28px}
.mark{font-weight:700;font-size:30px;letter-spacing:-1.2px}.mark span{color:#237F52}
h1{font-size:19px;margin:18px 0 4px}.sub{color:#6B675F;font-size:14px;margin-bottom:20px}
label{display:block;font-size:13px;font-weight:600;margin:12px 0 5px}
input{width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #D9D6D0;border-radius:8px;font-size:15px}
button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:8px;background:#237F52;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
.msg{margin-top:16px;font-size:14px;border-radius:8px;padding:12px 14px}
.ok{background:#EAF2ED;color:#17573A;border:1px solid #BEDCCB}.bad{background:#FBEEEC;color:#C0392B;border:1px solid #EFC9C3}</style>
<div class="card"><div class="mark">pulss<span>.</span></div>
${done ? `<h1>Seadistus on juba tehtud</h1><div class="sub">Administraator on olemas. Seda lehte enam ei vajata.</div><div class="msg ok">\u2713 S\xFCsteem on valmis. Logi sisse platvormil.</div>` : `<h1>Esmane seadistus</h1><div class="sub">Loo esimene administraator. Seda saab teha ainult \xFCks kord.</div>
<label>Nimi</label><input id="n" placeholder="Andrei Smagin">
<label>Kasutajanimi (login)</label><input id="l" placeholder="admin">
<label>Parool</label><input id="p" type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022">
<button onclick="go()">Loo administraator</button><div id="r"></div>`}</div>
<script>
async function go(){const n=document.getElementById('n').value.trim(),l=document.getElementById('l').value.trim(),p=document.getElementById('p').value;
const r=document.getElementById('r');if(!n||!l||!p){r.className='msg bad';r.textContent='T\xE4ida k\xF5ik v\xE4ljad';return;}
r.className='msg';r.textContent='...';
const res=await fetch('/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:n,login:l,password:p})});
const d=await res.json();
if(d.ok){r.className='msg ok';r.innerHTML='\u2713 Administraator loodud! N\xFC\xFCd saad platvormil sisse logida kasutajanimega <b>'+l+'</b>.';}
else{r.className='msg bad';r.textContent=d.error==='already_initialized'?'Administraator on juba olemas.':'Viga: '+(d.error||'tundmatu');}}
<\/script></html>`;
  return c.html(html);
});
async function startSession(c, subjectId, role) {
  const token = uid("s_") + uid();
  const expires = new Date(Date.now() + 30 * 864e5).toISOString();
  await c.env.DB.prepare(
    "INSERT INTO sessions (token, subject_id, role, expires_at) VALUES (?,?,?,?)"
  ).bind(token, subjectId, role, expires).run();
  c.header("Set-Cookie", sessionCookie(token));
}
app.post("/api/login", async (c) => {
  const { login, password } = await c.req.json();
  const key = String(login || "").trim();
  const u = await c.env.DB.prepare("SELECT * FROM staff WHERE login = ?").bind(key).first();
  if (u && await verifyPassword(password, u.password_hash)) {
    await startSession(c, u.id, u.role);
    return c.json({ ok: true, role: u.role, user: { id: u.id, name: u.name, role: u.role, perms: JSON.parse(u.perms || "{}") } });
  }
  const st = await c.env.DB.prepare(
    "SELECT * FROM students WHERE LOWER(first_name || ' ' || last_name) = LOWER(?)"
  ).bind(key).first();
  if (st && await verifyPassword(password, st.password_hash)) {
    if (st.archive_at && st.archive_at < nowISO().slice(0, 10)) return c.json({ error: "access_closed" }, 403);
    await startSession(c, st.id, "student");
    return c.json({ ok: true, role: "student", user: { id: st.id, first_name: st.first_name, last_name: st.last_name, email: st.email, group_id: st.group_id } });
  }
  return c.json({ error: "bad_credentials" }, 401);
});
app.post("/api/logout", async (c) => {
  const token = tokenFromReq(c);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  c.header("Set-Cookie", clearCookie());
  return c.json({ ok: true });
});
app.get("/api/me", async (c) => {
  const s = await auth(c);
  if (!s) return c.json({ error: "unauthorized" }, 401);
  if (s.role === "student") {
    const u2 = await c.env.DB.prepare("SELECT id, first_name, last_name, email, group_id FROM students WHERE id=?").bind(s.id).first();
    return c.json({ role: "student", user: u2 || { id: s.id } });
  }
  const u = await c.env.DB.prepare("SELECT id, name, login, role, perms FROM staff WHERE id=?").bind(s.id).first();
  return c.json({ role: s.role, user: u ? { ...u, perms: JSON.parse(u.perms || "{}") } : { id: s.id } });
});
app.get("/api/settings", async (c) => {
  const s = await c.env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
  const tpl = await c.env.DB.prepare("SELECT type, subject, body FROM email_templates").all();
  const templates = {};
  (tpl.results || []).forEach((t) => templates[t.type] = { subject: t.subject, body: t.body });
  return c.json({ ...s, templates });
});
app.put("/api/settings", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  const co = (v, d = null) => v === void 0 ? d : v;
  await c.env.DB.prepare(
    `UPDATE settings SET
       platform_name=COALESCE(?,platform_name), default_quiz_pass=COALESCE(?,default_quiz_pass),
       archive_days=COALESCE(?,archive_days), default_lang=COALESCE(?,default_lang), cert_valid_months=COALESCE(?,cert_valid_months),
       invoice_default_price=COALESCE(?,invoice_default_price), invoice_due_days=COALESCE(?,invoice_due_days),
       invoice_vat_rate=COALESCE(?,invoice_vat_rate), invoice_price_incl_vat=COALESCE(?,invoice_price_incl_vat),
       seller_name=COALESCE(?,seller_name), seller_regcode=COALESCE(?,seller_regcode), seller_vatno=COALESCE(?,seller_vatno),
       seller_address=COALESCE(?,seller_address), seller_iban=COALESCE(?,seller_iban), seller_bank=COALESCE(?,seller_bank),
       seller_email=COALESCE(?,seller_email), seller_phone=COALESCE(?,seller_phone),
       verify_base_url=COALESCE(?,verify_base_url), email_from=COALESCE(?,email_from), updated_at=?
     WHERE id=1`
  ).bind(
    co(b.platform_name),
    co(b.default_quiz_pass),
    co(b.archive_days),
    co(b.default_lang),
    co(b.cert_valid_months),
    co(b.invoice_default_price),
    co(b.invoice_due_days),
    co(b.invoice_vat_rate),
    b.invoice_price_incl_vat === void 0 ? null : b.invoice_price_incl_vat ? 1 : 0,
    co(b.seller_name),
    co(b.seller_regcode),
    co(b.seller_vatno),
    co(b.seller_address),
    co(b.seller_iban),
    co(b.seller_bank),
    co(b.seller_email),
    co(b.seller_phone),
    co(b.verify_base_url),
    co(b.email_from),
    nowISO()
  ).run();
  if (b.templates && typeof b.templates === "object") {
    for (const [type, tp] of Object.entries(b.templates)) {
      await c.env.DB.prepare("INSERT OR REPLACE INTO email_templates (type, subject, body) VALUES (?,?,?)").bind(type, tp && tp.subject || "", tp && tp.body || "").run();
    }
  }
  return c.json({ ok: true });
});
app.get("/api/groups", async (c) => {
  const r = await c.env.DB.prepare("SELECT id, name FROM groups ORDER BY name").all();
  return c.json(r.results || []);
});
app.post("/api/groups", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  const { name } = await c.req.json();
  if (!name) return c.json({ error: "missing_name" }, 400);
  const id = uid("g_");
  await c.env.DB.prepare("INSERT INTO groups (id, name) VALUES (?,?)").bind(id, name).run();
  return c.json({ id, name });
});
app.put("/api/groups/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  const { name } = await c.req.json();
  await c.env.DB.prepare("UPDATE groups SET name=? WHERE id=?").bind(name, c.req.param("id")).run();
  return c.json({ ok: true });
});
app.delete("/api/groups/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM groups WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
app.get("/api/students", async (c) => {
  const s = await auth(c);
  if (!s) return c.json({ error: "unauthorized" }, 401);
  const r = await c.env.DB.prepare(
    `SELECT s.id, s.first_name, s.last_name, s.isikukood, s.email, s.group_id,
            g.name AS group_name, s.status, s.last_active, s.archived, s.archived_at,
            s.completed_at, s.archive_at
       FROM students s LEFT JOIN groups g ON g.id = s.group_id
      ORDER BY s.last_name, s.first_name`
  ).all();
  return c.json(r.results || []);
});
app.post("/api/students", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  if (!b.first_name || !b.last_name || !b.isikukood) return c.json({ error: "missing_fields" }, 400);
  const created = await createStudent(c.env, b);
  return c.json(created);
});
app.post("/api/students/:id/reset-password", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const st = await c.env.DB.prepare("SELECT id, first_name, last_name, email FROM students WHERE id=?").bind(c.req.param("id")).first();
  if (!st) return c.json({ error: "not_found" }, 404);
  const password = genPass();
  const hash = await hashPassword(password);
  await c.env.DB.prepare("UPDATE students SET password_hash=? WHERE id=?").bind(hash, st.id).run();
  await queueCredsEmail(c.env, st, password);
  return c.json({ ok: true, password });
});
app.put("/api/students/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  let gid = b.group_id === void 0 ? void 0 : b.group_id || null;
  if (gid) {
    const g = await c.env.DB.prepare("SELECT id FROM groups WHERE id=?").bind(gid).first();
    if (!g) gid = null;
  }
  const co = (v) => v === void 0 ? null : v;
  await c.env.DB.prepare(
    `UPDATE students SET first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name),
       isikukood=COALESCE(?,isikukood), email=COALESCE(?,email), group_id=CASE WHEN ? THEN ? ELSE group_id END
     WHERE id=?`
  ).bind(
    co(b.first_name),
    co(b.last_name),
    co(b.isikukood),
    co(b.email),
    gid === void 0 ? 0 : 1,
    gid === void 0 ? null : gid,
    c.req.param("id")
  ).run();
  return c.json({ ok: true });
});
app.post("/api/students/:id/archive", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const { archived } = await c.req.json();
  if (archived) {
    await c.env.DB.prepare("UPDATE students SET archived=1, archived_at=? WHERE id=?").bind(nowISO().slice(0, 10), c.req.param("id")).run();
  } else {
    await c.env.DB.prepare("UPDATE students SET archived=0, archived_at=NULL, completed_at=NULL, archive_at=NULL WHERE id=?").bind(c.req.param("id")).run();
  }
  return c.json({ ok: true });
});
app.delete("/api/students/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const id = c.req.param("id");
  for (const sql of [
    "DELETE FROM enrollments WHERE student_id=?",
    "DELETE FROM progress WHERE student_id=?",
    "DELETE FROM quiz_scores WHERE student_id=?",
    "DELETE FROM quiz_attempts WHERE student_id=?",
    "DELETE FROM submissions WHERE student_id=?",
    "DELETE FROM students WHERE id=?"
  ]) {
    await c.env.DB.prepare(sql).bind(id).run();
  }
  return c.json({ ok: true });
});
function genPass() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = crypto.getRandomValues(new Uint32Array(8));
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += chars[a[i] % chars.length];
    if (i === 3) s += "-";
  }
  return s;
}
async function queueCredsEmail(env, student, password) {
  const set = await env.DB.prepare("SELECT platform_name FROM settings WHERE id=1").first();
  const tpl = await env.DB.prepare("SELECT subject, body FROM email_templates WHERE type='cred'").first();
  const vars = {
    student: `${student.first_name} ${student.last_name}`,
    login: `${student.first_name} ${student.last_name}`,
    password,
    platform: set?.platform_name || "Kursused"
  };
  const render = (str) => String(str || "").replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m);
  await env.DB.prepare("INSERT INTO outbox (id, to_email, subject, body, type) VALUES (?,?,?,?,?)").bind(uid("em_"), student.email || "", render(tpl?.subject), render(tpl?.body), "cred").run();
}
async function createStudent(env, b) {
  const id = uid("st_");
  const password = b.password || genPass();
  const hash = await hashPassword(password);
  await env.DB.prepare(
    "INSERT INTO students (id, first_name, last_name, isikukood, email, password_hash, group_id) VALUES (?,?,?,?,?,?,?)"
  ).bind(id, b.first_name, b.last_name, b.isikukood, b.email || "", hash, b.group_id || null).run();
  await queueCredsEmail(env, { id, ...b }, password);
  return { id, password };
}
app.post("/api/requests", async (c) => {
  const b = await c.req.json();
  if (!b.first_name || !b.last_name || !b.isikukood || !b.email) return c.json({ error: "missing_fields" }, 400);
  let gid = b.group_id || null;
  if (gid) {
    const g = await c.env.DB.prepare("SELECT id FROM groups WHERE id=?").bind(gid).first();
    if (!g) gid = null;
  }
  const id = uid("r_");
  await c.env.DB.prepare(
    "INSERT INTO requests (id, first_name, last_name, isikukood, email, group_id) VALUES (?,?,?,?,?,?)"
  ).bind(id, b.first_name, b.last_name, b.isikukood, b.email, gid).run();
  return c.json({ ok: true, id });
});
app.get("/api/requests", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const r = await c.env.DB.prepare(
    `SELECT r.id, r.first_name, r.last_name, r.isikukood, r.email, r.group_id, r.date, g.name AS group_name
       FROM requests r LEFT JOIN groups g ON g.id = r.group_id ORDER BY r.date`
  ).all();
  return c.json(r.results || []);
});
app.post("/api/requests/:id/approve", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const req = await c.env.DB.prepare("SELECT * FROM requests WHERE id=?").bind(c.req.param("id")).first();
  if (!req) return c.json({ error: "not_found" }, 404);
  const created = await createStudent(c.env, req);
  await c.env.DB.prepare("DELETE FROM requests WHERE id=?").bind(req.id).run();
  return c.json({
    ok: true,
    student_id: created.id,
    password: created.password,
    student: { first_name: req.first_name, last_name: req.last_name, email: req.email }
  });
});
app.delete("/api/requests/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM requests WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
app.post("/api/files", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  if (!c.env.FILES) return c.json({ error: "r2_not_configured" }, 500);
  const ct = c.req.header("content-type") || "application/octet-stream";
  const rawName = c.req.header("x-file-name") || "file";
  const safe = decodeURIComponent(rawName).replace(/[^\w.\-]+/g, "_").slice(-60) || "file";
  const key = uid("f_") + "-" + safe;
  const body = await c.req.arrayBuffer();
  if (body.byteLength > 15 * 1024 * 1024) return c.json({ error: "too_large" }, 413);
  await c.env.FILES.put(key, body, { httpMetadata: { contentType: ct } });
  const url = new URL(c.req.url).origin + "/api/files/" + key;
  return c.json({ key, url, name: safe });
});
app.get("/api/files/:key{.+}", async (c) => {
  if (!c.env.FILES) return c.json({ error: "r2_not_configured" }, 500);
  const key = c.req.param("key");
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.json({ error: "not_found" }, 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers: h });
});
app.delete("/api/files/:key{.+}", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  if (!c.env.FILES) return c.json({ error: "r2_not_configured" }, 500);
  await c.env.FILES.delete(c.req.param("key"));
  return c.json({ ok: true });
});
app.get("/api/courses", async (c) => {
  const s = await auth(c);
  const rows = await c.env.DB.prepare("SELECT content_json, published FROM courses ORDER BY position, created_at").all();
  let list = (rows.results || []).map((r) => {
    try {
      return JSON.parse(r.content_json || "null");
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
  if (!s || s.role === "student") list = list.filter((x) => x.published);
  return c.json(list);
});
app.post("/api/courses", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  const course = b.course || {};
  const id = uid("c_");
  course.id = id;
  await c.env.DB.prepare("INSERT INTO courses (id, title, published, content_json) VALUES (?,?,?,?)").bind(id, course.title || "", course.published ? 1 : 0, JSON.stringify(course)).run();
  return c.json({ id, course });
});
app.put("/api/courses/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  const course = b.course || {};
  const id = c.req.param("id");
  course.id = id;
  await c.env.DB.prepare("UPDATE courses SET title=?, published=?, content_json=? WHERE id=?").bind(course.title || "", course.published ? 1 : 0, JSON.stringify(course), id).run();
  return c.json({ ok: true });
});
app.delete("/api/courses/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM courses WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
app.get("/api/learning", async (c) => {
  const s = await auth(c);
  if (!s) return c.json({ error: "unauthorized" }, 401);
  const mine = s.role === "student" ? s.id : null;
  const q = (sql) => mine ? c.env.DB.prepare(sql + " WHERE student_id=?").bind(mine) : c.env.DB.prepare(sql);
  const [en, pr, qs, qa, sub] = await Promise.all([
    q("SELECT student_id, course_id FROM enrollments").all(),
    q("SELECT student_id, course_id, lesson_id FROM progress").all(),
    q("SELECT student_id, lesson_id, score FROM quiz_scores").all(),
    q("SELECT student_id, lesson_id, answers_json, layout_json FROM quiz_attempts").all(),
    q("SELECT id, student_id, course_id, homework_id, file_name, file_key, date, grade, feedback, graded_by, graded_at FROM submissions").all()
  ]);
  return c.json({
    enrollments: en.results || [],
    progress: pr.results || [],
    quiz_scores: qs.results || [],
    quiz_attempts: qa.results || [],
    submissions: sub.results || []
  });
});
app.post("/api/enroll", async (c) => {
  const s = await auth(c);
  if (!s) return c.json({ error: "unauthorized" }, 401);
  const b = await c.req.json();
  if (s.role === "student" && b.student_id && b.student_id !== s.id) return c.json({ error: "forbidden" }, 403);
  const sid = s.role === "student" ? s.id : b.student_id || s.id;
  if (!b.course_id) return c.json({ error: "missing_fields" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO enrollments (student_id, course_id) VALUES (?,?)").bind(sid, b.course_id).run();
  return c.json({ ok: true });
});
app.delete("/api/enroll", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  if (!b.student_id || !b.course_id) return c.json({ error: "missing_fields" }, 400);
  await c.env.DB.prepare("DELETE FROM enrollments WHERE student_id=? AND course_id=?").bind(b.student_id, b.course_id).run();
  return c.json({ ok: true });
});
app.post("/api/progress", async (c) => {
  const s = await auth(c);
  if (!s || s.role !== "student") return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  if (!b.course_id || !b.lesson_id) return c.json({ error: "missing_fields" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO progress (student_id, course_id, lesson_id) VALUES (?,?,?)").bind(s.id, b.course_id, b.lesson_id).run();
  return c.json({ ok: true });
});
app.post("/api/quiz-results", async (c) => {
  const s = await auth(c);
  if (!s || s.role !== "student") return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  if (!b.lesson_id) return c.json({ error: "missing_fields" }, 400);
  await c.env.DB.prepare("INSERT OR REPLACE INTO quiz_scores (student_id, lesson_id, score) VALUES (?,?,?)").bind(s.id, b.lesson_id, b.score | 0).run();
  await c.env.DB.prepare("INSERT OR REPLACE INTO quiz_attempts (student_id, lesson_id, answers_json, layout_json) VALUES (?,?,?,?)").bind(s.id, b.lesson_id, JSON.stringify(b.answers || {}), JSON.stringify(b.layout || {})).run();
  return c.json({ ok: true });
});
app.post("/api/submissions", async (c) => {
  const s = await auth(c);
  if (!s || s.role !== "student") return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  if (!b.course_id || !b.homework_id) return c.json({ error: "missing_fields" }, 400);
  const date = nowISO().slice(0, 10);
  const ex = await c.env.DB.prepare("SELECT id FROM submissions WHERE student_id=? AND homework_id=?").bind(s.id, b.homework_id).first();
  if (ex) {
    await c.env.DB.prepare("UPDATE submissions SET file_name=?, file_key=?, date=?, grade=NULL, feedback='', graded_by=NULL, graded_at=NULL WHERE id=?").bind(b.file_name || "", b.file_key || null, date, ex.id).run();
    return c.json({ ok: true, id: ex.id });
  }
  const id = uid("sub_");
  await c.env.DB.prepare("INSERT INTO submissions (id, student_id, course_id, homework_id, file_name, file_key, date) VALUES (?,?,?,?,?,?,?)").bind(id, s.id, b.course_id, b.homework_id, b.file_name || "", b.file_key || null, date).run();
  return c.json({ ok: true, id });
});
app.put("/api/submissions/:id/grade", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  await c.env.DB.prepare("UPDATE submissions SET grade=?, feedback=?, graded_by=?, graded_at=? WHERE id=?").bind(b.grade == null ? null : String(b.grade), b.feedback || "", b.graded_by || null, nowISO().slice(0, 10), c.req.param("id")).run();
  return c.json({ ok: true });
});
app.get("/api/company-search", async (c) => {
  if (!await auth(c)) return c.json({ error: "unauthorized" }, 401);
  const q = c.req.query("q");
  if (!q || q.trim().length < 2) return c.json({ results: [] });
  try {
    const url = "https://ariregister.rik.ee/est/api/autocomplete?q=" + encodeURIComponent(q) + "&results_limit=8";
    const res = await fetch(url, { headers: { Accept: "application/json" }, cf: { cacheTtl: 3600 } });
    if (!res.ok) return c.json({ results: [], error: "register_http_" + res.status }, 200);
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data.data || data.results || data.items || [];
    const results = arr.map((x) => ({
      name: x.name || x.nimi || x.company_name || "",
      regCode: String(x.reg_code || x.ariregistri_kood || x.registrikood || x.code || ""),
      vatNo: x.vat_number || x.kmkr || "",
      address: x.aadress || x.address || x.ehak_nimetus || ""
    })).filter((x) => x.name);
    return c.json({ results });
  } catch (e) {
    return c.json({ results: [], error: "register_unreachable" }, 200);
  }
});
app.get("/api/invoices", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const inv = await c.env.DB.prepare("SELECT * FROM invoices ORDER BY number DESC").all();
  const parts = await c.env.DB.prepare("SELECT * FROM invoice_participants").all();
  const items = await c.env.DB.prepare("SELECT * FROM invoice_items ORDER BY position").all();
  const byInv = (rows, id) => (rows.results || []).filter((r) => r.invoice_id === id);
  const out = (inv.results || []).map((iv) => ({
    ...iv,
    paid: !!iv.paid,
    priceIncludesVat: !!iv.price_includes_vat,
    participants: byInv(parts, iv.id).map((p) => ({ studentId: p.student_id, name: p.name, isikukood: p.isikukood })),
    items: byInv(items, iv.id).map((it) => ({ desc: it.descr, qty: it.qty, price: it.price }))
  }));
  return c.json(out);
});
app.post("/api/invoices", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const b = await c.req.json();
  if (!b.buyer?.name) return c.json({ error: "missing_buyer" }, 400);
  if (!(b.participants || []).length) return c.json({ error: "no_participants" }, 400);
  await c.env.DB.prepare("UPDATE settings SET invoice_seq = invoice_seq + 1 WHERE id = 1").run();
  const seqRow = await c.env.DB.prepare("SELECT invoice_seq FROM settings WHERE id = 1").first();
  const number = seqRow.invoice_seq;
  const numberStr = "ESM" + String(number).padStart(5, "0");
  const viitenumber = makeViitenumber(number);
  const id = uid("inv_");
  await c.env.DB.prepare(
    `INSERT INTO invoices (id, number, number_str, viitenumber, kind, mode, group_id, course_id,
       buyer_name, buyer_regcode, buyer_vatno, buyer_address, buyer_email,
       vat_rate, price_includes_vat, note, date, due_date, paid) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`
  ).bind(
    id,
    number,
    numberStr,
    viitenumber,
    "invoice",
    b.mode || "group",
    b.groupId || null,
    b.courseId || null,
    b.buyer.name,
    b.buyer.regCode || "",
    b.buyer.vatNo || "",
    b.buyer.address || "",
    b.buyer.email || "",
    b.vatRate ?? 24,
    b.priceIncludesVat ? 1 : 0,
    b.note || "",
    b.date || nowISO().slice(0, 10),
    b.dueDate || null
  ).run();
  for (const p of b.participants) {
    await c.env.DB.prepare("INSERT INTO invoice_participants (id, invoice_id, student_id, name, isikukood) VALUES (?,?,?,?,?)").bind(uid("ip_"), id, p.studentId || null, p.name, p.isikukood || "").run();
  }
  let pos = 0;
  for (const it of b.items || []) {
    await c.env.DB.prepare("INSERT INTO invoice_items (id, invoice_id, descr, qty, price, position) VALUES (?,?,?,?,?,?)").bind(uid("ii_"), id, it.desc || "", it.qty || 0, it.price || 0, pos++).run();
  }
  return c.json({ id, number, numberStr });
});
app.put("/api/invoices/:id/paid", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const { paid } = await c.req.json();
  await c.env.DB.prepare("UPDATE invoices SET paid=?, paid_date=? WHERE id=?").bind(paid ? 1 : 0, paid ? nowISO().slice(0, 10) : null, c.req.param("id")).run();
  return c.json({ ok: true });
});
app.delete("/api/invoices/:id", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  await c.env.DB.prepare("DELETE FROM invoices WHERE id=?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});
app.post("/api/invoices/:id/credit", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const orig = await c.env.DB.prepare("SELECT * FROM invoices WHERE id=?").bind(c.req.param("id")).first();
  if (!orig) return c.json({ error: "not_found" }, 404);
  if (orig.kind === "credit" || orig.credited_by) return c.json({ error: "already_credited" }, 409);
  await c.env.DB.prepare("UPDATE settings SET invoice_seq = invoice_seq + 1 WHERE id = 1").run();
  const seqRow = await c.env.DB.prepare("SELECT invoice_seq FROM settings WHERE id = 1").first();
  const number = seqRow.invoice_seq;
  const numberStr = "ESM" + String(number).padStart(5, "0");
  const id = uid("inv_");
  await c.env.DB.prepare(
    `INSERT INTO invoices (id, number, number_str, viitenumber, kind, credit_of, mode, group_id, course_id,
       buyer_name, buyer_regcode, buyer_vatno, buyer_address, buyer_email,
       vat_rate, price_includes_vat, note, date, due_date, paid, paid_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`
  ).bind(
    id,
    number,
    numberStr,
    makeViitenumber(number),
    "credit",
    orig.id,
    orig.mode,
    orig.group_id,
    orig.course_id,
    orig.buyer_name,
    orig.buyer_regcode,
    orig.buyer_vatno,
    orig.buyer_address,
    orig.buyer_email,
    orig.vat_rate,
    orig.price_includes_vat,
    `Arve storno ${orig.number_str}`,
    nowISO().slice(0, 10),
    nowISO().slice(0, 10),
    nowISO().slice(0, 10)
  ).run();
  const items = await c.env.DB.prepare("SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY position").bind(orig.id).all();
  for (const it of items.results || []) {
    await c.env.DB.prepare("INSERT INTO invoice_items (id, invoice_id, descr, qty, price, position) VALUES (?,?,?,?,?,?)").bind(uid("ii_"), id, it.descr, it.qty, -Math.abs(it.price), it.position).run();
  }
  const parts = await c.env.DB.prepare("SELECT * FROM invoice_participants WHERE invoice_id=?").bind(orig.id).all();
  for (const p of parts.results || []) {
    await c.env.DB.prepare("INSERT INTO invoice_participants (id, invoice_id, student_id, name, isikukood) VALUES (?,?,?,?,?)").bind(uid("ip_"), id, p.student_id, p.name, p.isikukood).run();
  }
  await c.env.DB.prepare("UPDATE invoices SET credited_by=? WHERE id=?").bind(id, orig.id).run();
  return c.json({ id, number, numberStr });
});
async function sendEmail(env, msg) {
  const from = msg.from || env.EMAIL_FROM;
  const key = env.RESEND_API_KEY;
  if (!key || !from) throw new Error("email_not_configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.body })
  });
  if (!res.ok) throw new Error("resend_" + res.status + ": " + (await res.text()).slice(0, 200));
  return await res.json();
}
async function flushOutbox(env, limit = 50) {
  const rows = await env.DB.prepare(
    "SELECT * FROM outbox WHERE status='pending' ORDER BY ts LIMIT ?"
  ).bind(limit).all();
  let sent = 0, failed = 0;
  for (const m of rows.results || []) {
    try {
      await sendEmail(env, { to: m.to_email, subject: m.subject, body: m.body });
      await env.DB.prepare("UPDATE outbox SET sent=1, status='sent', sent_at=? WHERE id=?").bind(nowISO(), m.id).run();
      sent++;
    } catch (e) {
      await env.DB.prepare("UPDATE outbox SET status='error', error=? WHERE id=?").bind(String(e.message || e).slice(0, 300), m.id).run();
      failed++;
    }
  }
  return { sent, failed, picked: (rows.results || []).length };
}
app.post("/api/outbox/flush", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin")) return c.json({ error: "forbidden" }, 403);
  return c.json(await flushOutbox(c.env));
});
app.get("/api/outbox", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const r = await c.env.DB.prepare("SELECT id, to_email, subject, type, ts, status, error, sent_at FROM outbox ORDER BY ts DESC LIMIT 100").all();
  return c.json(r.results || []);
});
app.get("/api/verify", async (c) => {
  const number = c.req.query("number");
  const last = (c.req.query("last") || "").trim().toLowerCase();
  if (!number) return c.json({ ok: false, error: "no_number" });
  const ct = await c.env.DB.prepare(
    `SELECT ct.number, ct.date, ct.valid_until, s.first_name, s.last_name, s.isikukood, co.title AS course
       FROM certificates ct JOIN students s ON s.id=ct.student_id JOIN courses co ON co.id=ct.course_id
      WHERE ct.number = ?`
  ).bind(+number).first();
  if (!ct) return c.json({ ok: false });
  if (last && !String(ct.last_name || "").toLowerCase().includes(last)) return c.json({ ok: false });
  const expired = ct.valid_until && ct.valid_until < nowISO().slice(0, 10);
  return c.json({
    ok: true,
    number: ct.number,
    name: `${ct.first_name} ${ct.last_name}`,
    course: ct.course,
    date: ct.date,
    validUntil: ct.valid_until,
    expired: !!expired
  });
});
app.get("/verify", async (c) => {
  const number = c.req.query("number") || "";
  const last = c.req.query("last") || "";
  const html = `<!doctype html><html lang="et"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tunnistuse kontroll</title>
<style>body{font-family:system-ui,Arial,sans-serif;background:#f4f5f9;margin:0;padding:40px 16px;color:#111}
.card{max-width:440px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 6px 30px rgba(0,0,0,.08);padding:28px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#6b7280;font-size:14px;margin-bottom:18px}
input{width:100%;box-sizing:border-box;padding:11px 13px;border:1.5px solid #e5e7eb;border-radius:9px;font-size:15px;margin-bottom:10px}
button{width:100%;padding:12px;border:0;border-radius:9px;background:#4f46e5;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
.res{margin-top:18px;border-radius:12px;padding:16px 18px;font-size:14px;line-height:1.6}
.ok{border:1.5px solid #16a34a;background:#f0fdf4}.bad{border:1.5px solid #dc2626;background:#fef2f2}
.k{color:#6b7280}.exp{color:#dc2626;font-weight:700}.val{color:#16a34a;font-weight:700}</style>
<div class="card"><h1>\u{1F393} Tunnistuse kontroll</h1><div class="sub">Sisesta tunnistuse number ja perekonnanimi.</div>
<input id="n" placeholder="Number (nt 1)" value="${number.replace(/[^0-9]/g, "")}">
<input id="l" placeholder="Perekonnanimi" value="${(last || "").replace(/[<>"]/g, "")}">
<button onclick="chk()">Kontrolli</button><div id="r"></div></div>
<script>
async function chk(){const n=document.getElementById('n').value,l=document.getElementById('l').value;
const r=document.getElementById('r');r.innerHTML='...';
const res=await fetch('/api/verify?number='+encodeURIComponent(n)+'&last='+encodeURIComponent(l));const d=await res.json();
if(!d.ok){r.className='res bad';r.innerHTML='\u26D4 Tunnistust ei leitud v\xF5i andmed ei klapi.';return;}
r.className='res ok';r.innerHTML='\u2705 <b>Kehtiv tunnistus</b><br><br>'+
'<span class="k">Nr:</span> <b>'+d.number+'</b><br><span class="k">Nimi:</span> <b>'+d.name+'</b><br>'+
'<span class="k">Koolitus:</span> <b>'+d.course+'</b><br><span class="k">V\xE4ljastatud:</span> '+d.date+'<br>'+
(d.expired?'<span class="exp">\u26D4 Kehtivus l\xF5ppenud ('+(d.validUntil||'')+')</span>':'<span class="val">\u{1F5D3}\uFE0F Kehtib kuni '+(d.validUntil||'\u2014')+'</span>');}
if(document.getElementById('n').value)chk();
<\/script></html>`;
  return c.html(html);
});
app.post("/api/invoices/:id/payment-link", async (c) => {
  const s = await auth(c);
  if (!requireRole(s, "admin", "teacher")) return c.json({ error: "forbidden" }, 403);
  const iv = await c.env.DB.prepare("SELECT * FROM invoices WHERE id=?").bind(c.req.param("id")).first();
  if (!iv) return c.json({ error: "not_found" }, 404);
  if (!c.env.MONTONIO_ACCESS_KEY) {
    return c.json({
      ok: false,
      error: "payments_not_configured",
      hint: "\u0417\u0430\u0434\u0430\u0439\u0442\u0435 MONTONIO_ACCESS_KEY / MONTONIO_SECRET_KEY"
    });
  }
  return c.json({ ok: true, paymentUrl: null, todo: "sign Montonio order here" });
});
app.post("/api/payments/webhook", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const ref = b.paymentReference || b.reference || b.merchant_reference;
  if (!ref) return c.json({ ok: false }, 400);
  const iv = await c.env.DB.prepare("SELECT id FROM invoices WHERE viitenumber=? OR number_str=?").bind(ref, ref).first();
  if (iv) await c.env.DB.prepare("UPDATE invoices SET paid=1, paid_date=? WHERE id=?").bind(nowISO().slice(0, 10), iv.id).run();
  return c.json({ ok: true });
});
app.get("/", (c) => c.json({ name: "lms-api", ok: true }));
app.all("*", (c) => c.json({ error: "not_found" }, 404));
var index_default = {
  fetch: app.fetch,
  // Крон (см. wrangler.toml [triggers]) разбирает очередь писем.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(flushOutbox(env, 100).catch(() => {
    }));
  }
};
export {
  index_default as default
};
