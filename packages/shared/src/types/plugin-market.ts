/**
 * 插件市场索引协议
 * 市场索引托管于远程 JSON（GitHub / 自建服务器），主进程拉取解析后供渲染进程浏览与安装。
 */

/** 索引元信息 */
export interface MarketIndexMeta {
  /** 索引协议版本 */
  version: string;
  /** 更新时间（ISO 字符串） */
  updatedAt: string;
  /** 源名称 */
  sourceName: string;
}

/** 市场插件条目 */
export interface MarketPluginItem {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  /** 分类标签 */
  tags: string[];
  /** 下载地址（zip 压缩包，https） */
  downloadUrl: string;
  /** zip 文件 sha256（十六进制） */
  hash: string;
  /** 文件大小（字节） */
  size?: number;
  /** 发布日期（ISO 字符串） */
  releaseDate?: string;
  homepage?: string;
  /** 下载量 */
  downloads?: number;
  /** 评分（0-5） */
  rating?: number;
  /** 最低宿主版本要求（如 "1.1.0"） */
  minHostVersion?: string;
}

/** 市场索引 */
export interface MarketIndex {
  meta: MarketIndexMeta;
  plugins: MarketPluginItem[];
}

/** 插件源配置 */
export interface PluginSource {
  id: string;
  name: string;
  url: string;
  /** 内置默认源（不可删除） */
  builtin?: boolean;
}

/** 插件更新信息（checkUpdates 结果） */
export interface PluginUpdateInfo {
  id: string;
  name: string;
  currentVersion: string;
  latestVersion: string;
}

/** 下载进度事件（主 → 渲） */
export interface PluginDownloadProgress {
  pluginId: string;
  /** 0-100 */
  percent: number;
  transferred: number;
  total: number;
}
