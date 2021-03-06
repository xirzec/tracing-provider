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

function getTracingClient(context: TracingContext): unknown {
  return context.getValue(clientKey);
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

export interface TracingProviderCreateSpanOptions {
  name: string;
  context?: unknown;
  // kind, links?
}

export interface TracingProvider {
  createSpan(options: TracingProviderCreateSpanOptions): { span: TracingSpan; context: unknown };
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
      ignorePackagePrefix?: boolean;
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
      ignorePackagePrefix?: boolean;
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
  createSpan(): { span: TracingSpan; context: unknown } {
    return { span: DoNothingSpan, context: undefined };
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

let defaultProvider: TracingProvider = DoNothingTracingProvider;

export function setDefaultTracingProvider(provider: TracingProvider) {
  defaultProvider = provider;
}

class TracingClientImpl implements TracingClient {
  private _provider: TracingProvider;
  private _namespace: string;
  private _packagePrefix: string;

  constructor(config: TracingClientConfig) {
    this._namespace = config.namespace;
    this._packagePrefix = config.packagePrefix;
    this._provider = config.provider ?? defaultProvider;
  }

  createSpan<T extends { tracingOptions?: OperationTracingOptions }>(
    operationName: string,
    options?: {
      operationOptions?: T;
      spanOptions?: TracingSpanOptions;
      ignorePackagePrefix?: boolean;
    }
  ): { context: TracingContext; span: TracingSpan; updatedOptions: T } {
    const spanName =
      this._packagePrefix && !options?.ignorePackagePrefix
        ? `${this._packagePrefix}.${operationName}`
        : operationName;
    const mergedOptions: TracingSpanOptions = {
      ...options?.spanOptions,
      ...options?.operationOptions?.tracingOptions,
      name: spanName,
    };

    const { context: parentContext, ...spanOptions } = mergedOptions;

    const createSpanOptions: TracingProviderCreateSpanOptions = {
      context: parentContext ? getProviderContext(parentContext) : undefined,
      ...spanOptions,
    };

    const { span, context: providerContext } = this._provider.createSpan(createSpanOptions);

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
      ignorePackagePrefix?: boolean;
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

export function getTracingClientFromContext(context?: TracingContext): TracingClient | undefined {
  if (context) {
    return getTracingClient(context) as TracingClient | undefined;
  }
}

export function wrapProviderContext(context: unknown): TracingContext {
  return createContext({ providerContext: context });
}
