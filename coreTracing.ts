function isError(e: any): e is Error {
  return typeof e === "object" && typeof e.message === "string";
}

export interface TracingContext {
  setValue(key: symbol, value: unknown): TracingContext;
  getValue(key: symbol): unknown;
  deleteValue(key: symbol): TracingContext;
}

class TracingContextImpl implements TracingContext {
  private _contextMap: Map<symbol, unknown>;
  constructor(initialContext: Map<symbol, unknown>) {
    this._contextMap = new Map<symbol, unknown>(initialContext);
  }

  setValue(key: symbol, value: unknown): TracingContext {
    const newContextMap = new Map<symbol, unknown>(this._contextMap);
    newContextMap.set(key, value);
    return new TracingContextImpl(newContextMap);
  }

  getValue(key: symbol): unknown {
    return this._contextMap.get(key);
  }

  deleteValue(key: symbol): TracingContext {
    const newContextMap = new Map<symbol, unknown>(this._contextMap);
    newContextMap.delete(key);
    return new TracingContextImpl(newContextMap);
  }
}

const spanKey = Symbol.for("@azure/core-tracing span");
const providerContextKey = Symbol.for("@azure/core-tracing provider context");
const clientKey = Symbol.for("@azure/core-tracing client");
const namespaceKey = Symbol.for("@azure/core-tracing service namespace");

function getProviderContext(context: TracingContext): unknown {
  return context.getValue(providerContextKey);
}

interface CreateContextOptions {
  span?: TracingSpan;
  client?: TracingClient;
  providerContext?: unknown;
  namespace?: string;
}

function createContext(options?: CreateContextOptions): TracingContext {
  const newContextMap = new Map<symbol, unknown>();

  if (options?.span) {
    newContextMap.set(spanKey, options.span);
  }

  if (options?.client) {
    newContextMap.set(clientKey, options.client);
  }

  if (options?.providerContext) {
    newContextMap.set(providerContextKey, options.providerContext);
  }

  if (options?.namespace) {
    newContextMap.set(namespaceKey, options.namespace);
  }

  return new TracingContextImpl(newContextMap);
}

export interface TracingProvider {
  createSpan(options: TracingSpanOptions): TracingSpan;
  createContext(span: TracingSpan): unknown;
  withContext<
    CallbackArgs extends unknown[],
    Callback extends (...args: CallbackArgs) => ReturnType<Callback>
  >(
    context: unknown,
    callback: Callback,
    callbackThis?: ThisParameterType<Callback>,
    ...callbackArgs: CallbackArgs
  ): ReturnType<Callback>;
}

export interface OperationTracingOptions {
  context?: TracingContext;
}

export interface TracingSpan {
  setAttribute(name: string, value: unknown): void;
  setFailure(error: Error | string): void;
  setSuccess(): void;
  end(): void;
  // links?
}

export interface TracingSpanOptions {
  name: string;
  context?: TracingContext;
  // kind, links?
}

export interface TracingClient {
  createSpan<T extends { tracingOptions?: OperationTracingOptions }>(
    operationName: string,
    options?: {
      operationOptions?: T;
      spanOptions?: TracingSpanOptions;
    }
  ): { span: TracingSpan; updatedOptions: T };
  withWrappedSpan<
    T extends { tracingOptions?: OperationTracingOptions },
    Callback extends (updatedOptions: T) => ReturnType<Callback>
  >(
    operationName: string,
    callback: Callback,
    options?: {
      operationOptions?: T;
      spanOptions?: TracingSpanOptions;
    }
  ): Promise<ReturnType<Callback>>;
  withContext<
    CallbackArgs extends unknown[],
    Callback extends (...args: CallbackArgs) => ReturnType<Callback>
  >(
    context: TracingContext,
    callback: Callback,
    callbackThis?: ThisParameterType<Callback>,
    ...callbackArgs: CallbackArgs
  ): ReturnType<Callback>;
}

export interface TracingClientConfig {
  packagePrefix: string;
  namespace: string;
  provider?: TracingProvider;
}

const DoNothingSpan: TracingSpan = {
  setAttribute(): void {},
  setFailure(): void {},
  setSuccess(): void {},
  end(): void {},
};

const DoNothingTracingProvider: TracingProvider = {
  createSpan(): TracingSpan {
    return DoNothingSpan;
  },
  createContext(): unknown {
    return undefined;
  },
  withContext<
    CallbackArgs extends unknown[],
    Callback extends (...args: CallbackArgs) => ReturnType<Callback>
  >(
    _context: unknown,
    callback: Callback,
    callbackThis?: ThisParameterType<Callback>,
    ...callbackArgs: CallbackArgs
  ): ReturnType<Callback> {
    return callback.apply(callbackThis, callbackArgs);
  },
};

class TracingClientImpl implements TracingClient {
  private _provider: TracingProvider;
  private _namespace: string;
  private _packagePrefix: string;

  constructor(config: TracingClientConfig) {
    this._namespace = config.namespace;
    this._packagePrefix = config.packagePrefix;
    this._provider = config.provider ?? DoNothingTracingProvider;
  }

  createSpan<T extends { tracingOptions?: OperationTracingOptions }>(
    operationName: string,
    options?: {
      operationOptions?: T;
      spanOptions?: TracingSpanOptions;
    }
  ): { context: TracingContext; span: TracingSpan; updatedOptions: T } {
    const spanName = this._packagePrefix
      ? `${this._packagePrefix}.${operationName}`
      : operationName;
    const mergedOptions: TracingSpanOptions = {
      ...options?.operationOptions?.tracingOptions,
      ...options?.spanOptions,
      name: spanName,
    };

    const span = this._provider.createSpan(mergedOptions);
    const providerContext = this._provider.createContext(span);

    if (this._namespace) {
      span.setAttribute("az.namespace", this._namespace);
    }

    const context = createContext({
      span,
      providerContext,
      client: this,
      namespace: this._namespace,
    });

    const newTracingOptions: OperationTracingOptions = {
      ...options?.operationOptions?.tracingOptions,
      context,
    };
    const updatedOptions: T = {
      ...(options?.operationOptions as T),
      tracingOptions: newTracingOptions,
    };

    return {
      context,
      span,
      updatedOptions,
    };
  }
  async withWrappedSpan<
    T extends { tracingOptions?: OperationTracingOptions },
    Callback extends (updatedOptions: T) => ReturnType<Callback>
  >(
    operationName: string,
    callback: Callback,
    options?: {
      operationOptions?: T;
      spanOptions?: TracingSpanOptions;
    }
  ): Promise<ReturnType<Callback>> {
    const { context, span, updatedOptions } = this.createSpan(operationName, options);

    try {
      const result = await this.withContext(context, callback, undefined, updatedOptions);
      span.setSuccess();
      return result;
    } catch (e) {
      if (isError(e)) {
        span.setFailure(e);
      } else {
        span.setFailure(`Unknown exception type from callback: ${e}`);
      }
      throw e;
    } finally {
      span.end();
    }
  }
  withContext<
    CallbackArgs extends unknown[],
    Callback extends (...args: CallbackArgs) => ReturnType<Callback>
  >(
    context: TracingContext,
    callback: Callback,
    callbackThis?: ThisParameterType<Callback>,
    ...callbackArgs: CallbackArgs
  ): ReturnType<Callback> {
    const providerContext = getProviderContext(context);
    return this._provider.withContext(providerContext, callback, callbackThis, ...callbackArgs);
  }
}

export function createTracingClient(config: TracingClientConfig): TracingClient {
  return new TracingClientImpl(config);
}
