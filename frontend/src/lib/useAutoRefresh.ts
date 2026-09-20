// ============================================================
// useAutoRefresh.ts - Hook de polling automatico
//
// FIX (William 2026-09-20): antes, quando alguem criava um agendamento
// ou mudava status de viatura, os outros operadores precisavam dar F5
// pra ver a atualizacao. Agora o hook faz polling a cada N ms.
//
// Otimizacoes:
// - Pausa o polling quando a aba NAO esta visivel (visibilitychange)
// - Faz refresh IMEDIATO quando a aba volta a ficar visivel
// - Cleanup automatico ao desmontar o componente
// - Pausa enquanto a pagina estiver em estado de loading (evita
//   race condition com carregamento inicial)
//
// Uso:
//   useAutoRefresh(() => carregar(), 10000)  // a cada 10s
// ============================================================

import { useEffect, useRef } from 'react'

export interface UseAutoRefreshOptions {
  /** Intervalo em ms (default 10000 = 10s) */
  interval?: number
  /** Se true, faz refresh imediato quando aba volta a ficar visivel */
  refreshOnFocus?: boolean
  /** Pausa o polling (ex: enquanto ta carregando a primeira vez) */
  paused?: boolean
}

export function useAutoRefresh(
  callback: () => void | Promise<void>,
  options: UseAutoRefreshOptions = {}
): void {
  const { interval = 10000, refreshOnFocus = true, paused = false } = options
  const callbackRef = useRef(callback)
  const pausedRef = useRef(paused)

  // Manter refs atualizados
  useEffect(() => { callbackRef.current = callback }, [callback])
  useEffect(() => { pausedRef.current = paused }, [paused])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let mounted = true

    function tick() {
      if (!mounted) return
      if (pausedRef.current) return
      if (document.hidden) return // aba nao visivel
      try {
        const result = callbackRef.current()
        if (result instanceof Promise) {
          result.catch(() => {}) // silenciar erro
        }
      } catch {
        // silenciar erro pra nao quebrar UI
      }
    }

    function start() {
      if (timer) return
      // Primeiro tick eh IMEDIATO + depois intervalo
      tick()
      timer = setInterval(tick, interval)
    }

    function stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        // aba escondida: para o timer (economia de bateria/rede)
        stop()
      } else {
        // aba visivel: refresh IMEDIATO + reinicia timer
        if (refreshOnFocus) tick()
        start()
      }
    }

    start()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      stop()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [interval, refreshOnFocus])
}
