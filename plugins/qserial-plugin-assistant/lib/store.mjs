/**
 * 知识库文件存储（模块 / 文档 CRUD 的持久化层）。
 * 数据存放于用户插件数据目录 knowledge/ 下，不污染全局。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createModuleMeta,
  createDocumentMeta,
  validateModule,
  validateDocument,
} from '@qserial/shared';

export class KnowledgeStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.knowledgeDir = path.join(dataDir, 'knowledge');
    this.documentsDir = path.join(this.knowledgeDir, 'documents');
    this.modulesFile = path.join(this.knowledgeDir, 'modules.json');
    this.docsFile = path.join(this.knowledgeDir, 'docs.json');
  }

  _ensure() {
    fs.mkdirSync(this.documentsDir, { recursive: true });
  }

  _readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return fallback;
    }
  }

  _writeJson(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, file);
  }

  _docFile(doc) {
    return path.join(this.documentsDir, `${doc.id}.${doc.type}`);
  }

  loadModules() {
    return this._readJson(this.modulesFile, []);
  }

  saveModules(modules) {
    this._ensure();
    this._writeJson(this.modulesFile, modules);
  }

  loadDocs() {
    return this._readJson(this.docsFile, []);
  }

  saveDocs(docs) {
    this._ensure();
    this._writeJson(this.docsFile, docs);
  }

  readDocContent(doc) {
    try {
      return fs.readFileSync(this._docFile(doc), 'utf-8');
    } catch {
      return '';
    }
  }

  writeDocContent(doc, content) {
    this._ensure();
    fs.writeFileSync(this._docFile(doc), content, 'utf-8');
  }

  removeDocFile(doc) {
    try {
      fs.rmSync(this._docFile(doc), { force: true });
    } catch {
      /* ignore */
    }
  }

  // ==================== 模块 ====================

  getModule(id) {
    return this.loadModules().find((m) => m.id === id) || null;
  }

  listModules() {
    const modules = this.loadModules();
    const docs = this.loadDocs();
    return modules.map((m) => {
      const modDocs = docs.filter((d) => d.moduleId === m.id);
      return { ...m, docCount: modDocs.length };
    });
  }

  createModule(input) {
    const v = validateModule(input);
    if (!v.ok) throw new Error(v.errors.join('；'));
    const modules = this.loadModules();
    const id = input.id || createModuleMeta(input).id;
    if (modules.some((m) => m.id === id)) throw new Error(`模块已存在: ${id}`);
    const meta = createModuleMeta({ ...input, id, type: 'custom' });
    modules.push(meta);
    this.saveModules(modules);
    return meta;
  }

  updateModule(id, patch) {
    const modules = this.loadModules();
    const idx = modules.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error(`模块不存在: ${id}`);
    const m = modules[idx];
    const name = patch.name !== undefined ? patch.name : m.name;
    if (!name || !String(name).trim()) throw new Error('模块名称不能为空');
    const next = {
      ...m,
      name: String(name).trim(),
      description: patch.description !== undefined ? String(patch.description) : m.description,
      tags: Array.isArray(patch.tags) ? patch.tags.map((t) => String(t).trim()).filter(Boolean) : m.tags,
      updatedAt: Date.now(),
    };
    modules[idx] = next;
    this.saveModules(modules);
    return next;
  }

  deleteModule(id) {
    const modules = this.loadModules();
    const m = modules.find((x) => x.id === id);
    if (!m) throw new Error(`模块不存在: ${id}`);
    if (m.type === 'builtin') throw new Error('内置模块不可删除');
    this.saveModules(modules.filter((x) => x.id !== id));
    // 删除该模块下所有文档
    const docs = this.loadDocs().filter((d) => d.moduleId !== id);
    for (const d of this.loadDocs().filter((d) => d.moduleId === id)) this.removeDocFile(d);
    this.saveDocs(docs);
  }

  setModuleEnabled(id, enabled) {
    const modules = this.loadModules();
    const idx = modules.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error(`模块不存在: ${id}`);
    modules[idx] = { ...modules[idx], enabled: !!enabled, updatedAt: Date.now() };
    this.saveModules(modules);
    return modules[idx];
  }

  // ==================== 文档 ====================

  listDocs(moduleId) {
    return this.loadDocs().filter((d) => d.moduleId === moduleId);
  }

  getDoc(moduleId, docId) {
    return this.listDocs(moduleId).find((d) => d.id === docId) || null;
  }

  createDoc(moduleId, input) {
    const v = validateDocument(input);
    if (!v.ok) throw new Error(v.errors.join('；'));
    if (!this.getModule(moduleId)) throw new Error(`模块不存在: ${moduleId}`);
    const meta = createDocumentMeta(moduleId, input);
    const docs = this.loadDocs();
    docs.push(meta);
    this.saveDocs(docs);
    this.writeDocContent(meta, input.content);
    return meta;
  }

  updateDoc(moduleId, docId, patch) {
    const docs = this.loadDocs();
    const idx = docs.findIndex((d) => d.id === docId && d.moduleId === moduleId);
    if (idx === -1) throw new Error(`文档不存在: ${docId}`);
    const old = docs[idx];
    const title = patch.title !== undefined ? patch.title : old.title;
    if (!title || !String(title).trim()) throw new Error('文档标题不能为空');
    const content = patch.content !== undefined ? patch.content : this.readDocContent(old);
    const next = { ...old, title: String(title).trim(), updatedAt: Date.now(), charCount: content.length };
    docs[idx] = next;
    this.saveDocs(docs);
    this.writeDocContent(next, content);
    return next;
  }

  deleteDoc(moduleId, docId) {
    const docs = this.loadDocs();
    const doc = docs.find((d) => d.id === docId && d.moduleId === moduleId);
    if (!doc) throw new Error(`文档不存在: ${docId}`);
    this.removeDocFile(doc);
    this.saveDocs(docs.filter((d) => !(d.id === docId && d.moduleId === moduleId)));
  }

  /** 列出某模块全部文档（含正文），供索引重建使用。 */
  listDocsWithContent(moduleId) {
    return this.listDocs(moduleId).map((meta) => ({ meta, content: this.readDocContent(meta) }));
  }
}
