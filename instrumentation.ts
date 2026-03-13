// instrumentation.ts
export async function register() {
//   if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setGlobalDispatcher, Agent } = await import('undici')

    setGlobalDispatcher(new Agent({
      keepAliveTimeout: 4_000,
      keepAliveMaxTimeout: 10_000,
    }))
//   }
}