import {
  refreshBatteryE87,
  getTargetInfoE87,
  getTargetFeatureMapE87,
  getSysInfoE87,
  getScreenInfoE87,
  getBrightnessE87,
  setBrightnessE87,
  decodePeripherals,
  type E87Connection,
} from './e87-protocol'

export type ScreenInfo = {
  width: number
  height: number
  pictureWidth: number
  pictureHeight: number
  memory: number
}

export interface DeviceOpsCallbacks {
  log: (msg: string) => void
  setStatus: (s: string) => void
  setBusy: (b: boolean) => void
  setBattery: (level: number | null, updatedAt: string, charging: boolean) => void
  setBrightnessLevel: (n: number | null) => void
  setRcspInfoText: (text: string) => void
  applyScreenInfo: (info: ScreenInfo | null) => void
  getConnection: () => E87Connection | null
}

export interface DeviceOps {
  refreshBattery: () => Promise<void>
  getBrightness: () => Promise<void>
  setBrightness: (level: number) => Promise<void>
  /** Run any connection-bound op under the shared BLE lock; resolves undefined on failure. */
  run: <T>(label: string, fn: (c: E87Connection) => Promise<T>) => Promise<T | undefined>
  queryScreenInfo: () => Promise<void>
  getTargetFeatureMap: () => Promise<void>
  getTargetInfo: () => Promise<void>
  getSysInfo: () => Promise<void>
}

export function createDeviceOps(cb: DeviceOpsCallbacks): DeviceOps {
  const {
    log,
    setStatus,
    setBusy,
    setBattery,
    setBrightnessLevel,
    setRcspInfoText,
    applyScreenInfo,
    getConnection,
  } = cb

  // Execution lock to prevent concurrent BLE operations from interleaving
  // commands and corrupting the shared notification queue.
  let isExecuting = false

  /**
   * Wraps a single connection-bound device op with the standard
   * "not-connected guard + busy flag + try/catch with status + log"
   * boilerplate. Migrated from ~9 copy-pasted try/finally blocks. The
   * callback receives the live `E87Connection` so the call site doesn't
   * have to re-narrow `conn` after the guard. On failure, `status` is
   * set to "<errorPrefix> failed: <message>" - preserving the exact
   * strings the user already sees in the status pill.
   */
  async function runDeviceOp<T>(
    errorPrefix: string,
    fn: (c: E87Connection) => Promise<T>,
  ): Promise<T | undefined> {
    if (isExecuting) {
      log(`${errorPrefix}: operation already in progress, skipping.`)
      return
    }
    const conn = getConnection()
    if (!conn) {
      setStatus('Not connected.')
      return
    }
    isExecuting = true
    setBusy(true)
    try {
      return await fn(conn)
    } catch (error) {
      const msg = `${errorPrefix} failed: ${(error as Error).message}`
      setStatus(msg)
      log(msg)
    } finally {
      isExecuting = false
      setBusy(false)
    }
  }

  async function refreshBattery(): Promise<void> {
    await runDeviceOp('Battery read', async (c) => {
      const result = await refreshBatteryE87(c, log)
      setBattery(result.level, result.updatedAt, result.charging)
      if (result.level === null) {
        setStatus('Battery service unavailable on this device.')
      }
    })
  }

  async function getBrightness(): Promise<void> {
    await runDeviceOp('Brightness read', async (c) => {
      const level = await getBrightnessE87(c, log)
      setBrightnessLevel(level)
    })
  }

  async function setBrightness(level: number): Promise<void> {
    await runDeviceOp('Brightness set', async (c) => {
      await setBrightnessE87(c, level, log)
      setBrightnessLevel(Math.max(0, Math.min(100, Math.round(level))))
    })
  }

  async function queryScreenInfo(): Promise<void> {
    await runDeviceOp('ScreenInfo', async (c) => {
      const info = await getScreenInfoE87(c, log)
      applyScreenInfo(info)
      setRcspInfoText(JSON.stringify({
        command: 'GetScreenInfoCmd',
        info,
      }, null, 2))
      setStatus(info ? `Screen: ${info.width}x${info.height} (pic ${info.pictureWidth}x${info.pictureHeight})` : 'ScreenInfo: no response.')
    })
  }

  async function getTargetFeatureMap(): Promise<void> {
    await runDeviceOp('GetTargetFeatureMapCmd', async (c) => {
      const res = await getTargetFeatureMapE87(c, log)
      setRcspInfoText(JSON.stringify({
        command: 'GetTargetFeatureMapCmd',
        maskHex: `0x${res.mask.toString(16).padStart(8, '0')}`,
        supported: res.mask !== 0,
        raw: res.raw,
      }, null, 2))
      setStatus(res.mask !== 0
        ? `FeatureMap: 0x${res.mask.toString(16).padStart(8, '0')}`
        : 'FeatureMap: not supported by this device.')
    })
  }

  async function getTargetInfo(): Promise<void> {
    await runDeviceOp('GetTargetInfoCmd', async (c) => {
      const res = await getTargetInfoE87(c, log)
      const peripheralAttr = res.attrs.find((a) => a.type === 18)
      const peripheralBitmask = peripheralAttr
        ? Number.parseInt(peripheralAttr.dataHex, 16) || 0
        : 0
      const peripherals = peripheralBitmask
        ? decodePeripherals(peripheralBitmask)
        : []
      const peripheralsText = peripherals.length
        ? `Peripherals: ${peripherals.join(', ')}`
        : 'Peripherals: None detected'
      setRcspInfoText(JSON.stringify({
        command: 'GetTargetInfoCmd',
        requestMaskHex: `0x${res.requestMask.toString(16)}`,
        requestPlatform: res.requestPlatform,
        peripherals: peripheralsText,
        attrs: res.attrs,
        payloadHex: res.payload,
        rawBodyHex: res.raw,
      }, null, 2))
      setStatus('GetTargetInfoCmd completed.')
    })
  }

  async function getSysInfo(): Promise<void> {
    await runDeviceOp('GetSysInfoCmd', async (c) => {
      const res = await getSysInfoE87(c, log)
      const batteryAttr = res.attrs.find((a) => a.type === 0)
      const batteryGuess = batteryAttr?.decoded ?? batteryAttr?.dataHex ?? null
      // peripherals_support is attr 18 in TargetInfo; unlikely in SysInfo but decode if present
      const peripheralAttr = res.attrs.find((a) => a.name === 'peripherals_support')
      const peripheralBitmask = peripheralAttr
        ? Number.parseInt(peripheralAttr.dataHex, 16) || 0
        : 0
      const peripherals = peripheralBitmask
        ? decodePeripherals(peripheralBitmask)
        : []
      const peripheralsText = peripheralAttr
        ? (peripherals.length ? `Peripherals: ${peripherals.join(', ')}` : 'Peripherals: None detected')
        : undefined
      setRcspInfoText(JSON.stringify({
        command: 'GetSysInfoCmd',
        functionHex: `0x${res.function.toString(16)}`,
        batteryGuess,
        ...(peripheralsText ? { peripherals: peripheralsText } : {}),
        attrs: res.attrs,
        rawPayloadHex: res.raw,
      }, null, 2))
      if (batteryAttr?.decoded?.endsWith('%')) {
        const n = Number.parseInt(batteryAttr.decoded, 10)
        if (Number.isFinite(n)) {
          setBattery(n, new Date().toLocaleTimeString(), false)
        }
      }
      setStatus('GetSysInfoCmd completed.')
    })
  }

  return {
    refreshBattery,
    getBrightness,
    setBrightness,
    run: runDeviceOp,
    queryScreenInfo,
    getTargetFeatureMap,
    getTargetInfo,
    getSysInfo,
  }
}
