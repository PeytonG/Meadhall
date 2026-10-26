// SPDX-License-Identifier: AGPL-3.0-only
// arRPC ships plain JavaScript; Meadhall uses its two transports (see richPresence.ts).
declare module "arrpc/src/transports/ipc.js" {
    const IPCServer: unknown;
    export default IPCServer;
}
declare module "arrpc/src/transports/websocket.js" {
    const WSServer: unknown;
    export default WSServer;
}
