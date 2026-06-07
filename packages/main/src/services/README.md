/**
 * QSerial Services Module
 * 
 * Directory Structure:
 *   connection/  - Connection layer (Serial, SSH, Telnet, PTY)
 *   mcp/         - MCP server, tools, resources, notifications
 *   sftp/        - SFTP file transfer (over SSH)
 *   ftp/         - FTP server for file serving
 *   nfs/         - NFS server for file sharing
 *   tftp/        - TFTP server for embedded device provisioning
 *
 * Key files:
 *   mcp/manager.ts       - MCP tool definitions + execution (~2200 lines)
 *   mcp/ai-helpers.ts    - AI utilities (history, AT parser, prompt extraction)
 *   mcp/notifications.ts - MCP notification system (8 types)
 *   mcp/resources.ts     - MCP resource definitions (6 URIs)
 *   mcp/sampling.ts      - MCP sampling for reverse AI requests
 *   mcp/prompts.ts       - MCP prompt templates
 *   mcp/plugin-loader.ts - Community plugin loader
 *   mcp/xmodem.ts        - XModem file transfer protocol
 *   connection/factory.ts - Connection lifecycle management
 */