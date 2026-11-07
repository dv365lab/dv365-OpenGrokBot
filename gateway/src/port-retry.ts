import type { Server } from 'node:net'

/** Retry the actual bind, not a separate probe which could race another process. */
export function retryOccupiedPort(
  server: Server,
  options: { port: number; host: string; log: (message: string) => void },
): void {
  let port = options.port
  const onError = (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE' || port === 0) {
      server.removeListener('error', onError)
      throw error
    }
    const occupied = port
    // At the end of the range, let the OS allocate an available port atomically.
    port = port < 65535 ? port + 1 : 0
    options.log(`[gateway] 端口 ${occupied} 已被占用，尝试${port === 0 ? '系统分配的空闲端口' : `端口 ${port}`}…`)
    server.listen({ port, host: options.host })
  }
  server.on('error', onError)
  server.once('listening', () => server.removeListener('error', onError))
}
