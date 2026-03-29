"use strict";
/**
 * MCP Server 入口
 * 导出 MCP Server 相关模块
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPDataSync = exports.MCPCommandHandler = exports.server = void 0;
var server_1 = require("./server");
Object.defineProperty(exports, "server", { enumerable: true, get: function () { return server_1.server; } });
var commandHandler_1 = require("./commandHandler");
Object.defineProperty(exports, "MCPCommandHandler", { enumerable: true, get: function () { return commandHandler_1.MCPCommandHandler; } });
var dataSync_1 = require("./dataSync");
Object.defineProperty(exports, "MCPDataSync", { enumerable: true, get: function () { return dataSync_1.MCPDataSync; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map